#!/bin/bash
set -Eeuo pipefail

#############################################
# Blue-Green Deployment Script
#
# Usage:
#   IMAGE_REF=ghcr.io/<repo>/chatbot-gate-backend@sha256:<digest> ./deploy-blue-green.sh
#   ./deploy-blue-green.sh --find-upstream   # Find Caddy upstream path only
#
# The image is given as a full digest reference. Tags are not accepted.
#
# The last line of output is "DEPLOY_RESULT code=<code> reason=<REASON>".
#   0  deployed
#   1  failed; serving is confirmed to be the same as before the run
#   2  serving changed or could not be confirmed; someone has to look
#
# Reasons:
#   0  OK
#   1  INPUT_INVALID LOCK_HELD STATE_MISSING STATE_INVALID
#      UPSTREAM_QUERY_FAILED UPSTREAM_TARGET_UNKNOWN UPSTREAM_ENV_UNRESOLVED
#      UPSTREAM_AMBIGUOUS UPSTREAM_PATH_MISMATCH UPSTREAM_DEAD
#      SERVING_UNVERIFIED SERVING_IMAGE_UNKNOWN SERVING_NO_IDENTIFIER STATE_SAVE_FAILED
#      PULL_FAILED IMAGE_NO_IDENTIFIER START_FAILED NEW_UNHEALTHY IMAGE_MISMATCH
#      STALE_REMOVE_FAILED NEW_UNREACHABLE SWITCH_NOT_APPLIED ROLLED_BACK
#   2  SWITCH_UNKNOWN ROLLBACK_UNCONFIRMED RECOVERY_FAILED STATE_SAVE_FAILED
#      UPSTREAM_CHANGED INTERRUPTED UNCLASSIFIED
#
# After the switch is verified, the state file is saved first and the old
# environment is removed after. A failed removal of the old container or of
# old images is a warning; the result stays 0.
#
# A failure the script does not classify, and any signal, ends the run with
# code 2 without sending another PATCH, stop, rm or state write. The next run
# starts from the actual upstream.
#############################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

# Parse command line arguments
FIND_UPSTREAM_ONLY=false
for arg in "$@"; do
  case $arg in
    --find-upstream|--validate-caddy)
      FIND_UPSTREAM_ONLY=true
      ;;
  esac
done

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

STATE_FILE="${REPO_ROOT}/.deployment-state"
LOCK_FILE="${REPO_ROOT}/.deploy.lock"
COMPOSE_FILE="${REPO_ROOT}/docker-compose.yml"
GITHUB_REPO="${GITHUB_REPO:-diamondgonny/chatbot-gate}"
IMAGE_REPO="ghcr.io/${GITHUB_REPO}/chatbot-gate-backend"
CONTAINER_PREFIX="chatbot-gate-backend"
DB_PROFILE="--profile db"

# Configuration
HEALTH_CHECK_MAX_WAIT=90
HEALTH_CHECK_INTERVAL=3
VERIFY_CHECKS=5      # Requests through Caddy after a switch or a rollback
VERIFY_INTERVAL=2    # Seconds between them
VERIFY_MAX=30        # Seconds for the whole verification
CADDY_CONTAINER="caddy"  # Caddy container name
CADDY_ADMIN_HOST="127.0.0.1"  # Internal to Caddy container (IPv4 only)
CADDY_ADMIN_PORT=2019
CADDY_HTTP_PORT="${CADDY_HTTP_PORT:-80}"  # Port Caddy serves the API site on, inside its container
CADDY_UPSTREAM_PATH="${CADDY_UPSTREAM_PATH:-}"  # Optional: the detected path must equal this
API_HOST="api.chatbotgate.click"
HTTP_TIMEOUT=3  # Seconds for one HTTP request

# Logging functions
timestamp() {
  printf '%(%Y-%m-%d %H:%M:%S)T' -1
}

log() {
  echo -e "${BLUE}$(timestamp)${NC} - $*"
}

error() {
  echo -e "${RED}$(timestamp) - ERROR:${NC} $*" >&2
}

success() {
  echo -e "${GREEN}$(timestamp) - ✅${NC} $*"
}

warning() {
  echo -e "${YELLOW}$(timestamp) - ⚠️${NC} $*"
}

# End the run. Every exit of a deployment goes through here.
RESULT_REPORTED=false
finish() {
  local code=$1 reason=$2
  RESULT_REPORTED=true
  echo "DEPLOY_RESULT code=${code} reason=${reason}"
  exit "${code}"
}

# A command failed that no step handles. Subshells only pass the failure up.
on_error() {
  local code=$1 line=$2
  if ((BASH_SUBSHELL > 0)); then
    exit "${code}"
  fi
  error "Unclassified failure at line ${line} (exit ${code}); stopping without further changes"
  finish 2 UNCLASSIFIED
}

on_signal() {
  trap '' TERM INT HUP
  error "Received SIG$1; stopping without further changes"
  finish 2 INTERRUPTED
}

# Covers exits that bypass finish, such as an unbound variable.
on_exit() {
  if [[ ${RESULT_REPORTED} == false ]]; then
    error "The script ended without a result; stopping without further changes"
    echo "DEPLOY_RESULT code=2 reason=UNCLASSIFIED"
    exit 2
  fi
}

install_traps() {
  trap 'on_error $? $LINENO' ERR
  trap 'on_signal TERM' TERM
  trap 'on_signal INT' INT
  trap 'on_signal HUP' HUP
  trap on_exit EXIT
}

# One deployment at a time. A conflict fails at once instead of waiting.
# Child processes inherit the descriptor, so the lock stays held while any of
# them is alive.
acquire_lock() {
  exec 9>> "${LOCK_FILE}"
  if ! flock -n 9; then
    error "Another deployment holds ${LOCK_FILE}"
    finish 1 LOCK_HELD
  fi
  rm -f "${STATE_FILE}".tmp.*
}

other_env() {
  if [[ $1 == blue ]]; then echo green; else echo blue; fi
}

# Read fields out of JSON and HTTP output. Unless noted, prints one line of
# space-separated fields, "-" for a field that is missing.
json_tool() {
  python3 -c '
import json, re, sys

def field(value):
    value = str(value or "")
    return value if re.fullmatch(r"[A-Za-z0-9._:/@-]+", value) else "-"

def env_of(data):
    entries = (data.get("Config") or {}).get("Env") or []
    return dict(e.split("=", 1) for e in entries if "=" in e)

def first(raw):
    try:
        return json.loads(raw)[0]
    except Exception:
        return None

def backend_upstreams(routes, base, in_host, host, prefix, found):
    # Walk routes and nested subroutes; collect every upstreams list that dials a backend
    for r, route in enumerate(routes or []):
        matched = in_host or any(host in (m.get("host") or []) for m in route.get("match") or [])
        for h, handler in enumerate(route.get("handle") or []):
            path = f"{base}/routes/{r}/handle/{h}"
            dials = [u.get("dial", "") for u in handler.get("upstreams") or []]
            if any(prefix in d for d in dials):
                found.append((path + "/upstreams", matched, dials))
            backend_upstreams(handler.get("routes"), path, matched, host, prefix, found)

cmd = sys.argv[1]
raw = sys.stdin.read()

if cmd == "image":
    # <image id> <build> <digest reference in our repository>
    data = first(raw)
    if data is None:
        print("- - -")
    else:
        build = env_of(data).get("BUILD_SHA", "")
        digests = sorted(d for d in data.get("RepoDigests") or [] if d.startswith(sys.argv[2] + "@"))
        chosen = sys.argv[3] if sys.argv[3] in digests else (digests[0] if digests else "")
        print(field(data.get("Id")), field("" if build == "unknown" else build), field(chosen))
elif cmd == "container":
    # <container id> <image id> <running> <health> <ACTIVE_ENV of the container>
    data = first(raw)
    if data is None:
        print("- - - - -")
    else:
        state = data.get("State") or {}
        print(field(data.get("Id")), field(data.get("Image")),
              "true" if state.get("Running") else "false",
              field((state.get("Health") or {}).get("Status")),
              field(env_of(data).get("ACTIVE_ENV")))
elif cmd == "upstreams":
    # Caddy servers config -> "ok <path> <dial>" or "error <REASON> <detail>"
    host, prefix = sys.argv[2], sys.argv[3]
    found = []
    try:
        for name, server in json.loads(raw).items():
            backend_upstreams(server.get("routes"), f"/config/apps/http/servers/{name}", False, host, prefix, found)
    except Exception:
        print("error UPSTREAM_QUERY_FAILED the Caddy configuration could not be parsed")
        sys.exit(0)
    if not found:
        print(f"error UPSTREAM_TARGET_UNKNOWN no upstream dials {prefix}")
    elif len(found) > 1:
        print("error UPSTREAM_AMBIGUOUS several upstream lists dial the backend: " + " ".join(f[0] for f in found))
    elif not found[0][1]:
        print(f"error UPSTREAM_TARGET_UNKNOWN the backend upstream is not under {host}")
    elif len(found[0][2]) != 1:
        print("error UPSTREAM_AMBIGUOUS the upstream list has several dials: " + " ".join(found[0][2]))
    elif re.search(r"\s", found[0][2][0]):
        print("error UPSTREAM_TARGET_UNKNOWN the dial is malformed")
    else:
        print("ok", found[0][0], found[0][2][0])
elif cmd == "http":
    # Raw HTTP response -> its status, 000 without a response
    status = re.match(r"HTTP/\d\.\d (\d{3})", raw)
    print(status.group(1) if status else "000")
elif cmd == "health":
    # /health body -> "<env> <build>", or "invalid" when it is not a JSON object
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError
    except Exception:
        print("invalid")
        sys.exit(0)
    env, build = data.get("env"), data.get("build")
    print(field("" if env == "unknown" else env), field("" if build == "unknown" else build))
' "$@"
}

undash() {
  local name
  for name in "$@"; do
    if [[ ${!name} == - ]]; then
      printf -v "${name}" '%s' ''
    fi
  done
}

# Sets IMG_ID, IMG_BUILD and IMG_REF for a local image. Empty when unknown.
# IMG_REF is the digest reference; a second argument is kept when the image has it.
image_info() {
  local json
  json=$(docker image inspect "$1" 2>/dev/null) || json=""
  read -r IMG_ID IMG_BUILD IMG_REF < <(json_tool image "${IMAGE_REPO}" "${2:-}" <<< "${json}")
  undash IMG_ID IMG_BUILD IMG_REF
}

# Sets C_ID, C_IMAGE, C_RUNNING, C_HEALTH and C_ACTIVE_ENV for a container.
# C_ID is empty when it does not exist.
# Only "no such container" counts as absent; any other inspect failure ends
# the run as an unclassified failure instead of being read as "not there".
container_info() {
  local json
  if ! json=$(docker inspect "$1" 2>&1); then
    if [[ ${json} != *"No such"* ]]; then
      error "docker inspect $1 failed: ${json}"
      return 1
    fi
    json=""
  fi
  read -r C_ID C_IMAGE C_RUNNING C_HEALTH C_ACTIVE_ENV < <(json_tool container <<< "${json}")
  undash C_ID C_IMAGE C_HEALTH C_ACTIVE_ENV
}

# GET a URL from inside the Caddy container with its wget.
# Usage: caddy_get <url> [Host header]
# Sets HTTP_STATUS (000 when no response arrived in time) and HTTP_BODY.
caddy_get() {
  local url=$1 header=${2:-}
  local out
  local -a options=(-q -O- -T "${HTTP_TIMEOUT}")

  if [[ -n ${header} ]]; then
    options+=(--header "Host: ${header}")
  fi
  HTTP_BODY=""
  if out=$(timeout "${HTTP_TIMEOUT}" docker exec "${CADDY_CONTAINER}" wget "${options[@]}" "${url}" 2>&1); then
    HTTP_STATUS=200
    HTTP_BODY=${out}
  elif [[ ${out} =~ HTTP/[0-9.]+\ ([0-9]{3}) ]]; then
    # busybox wget: "server returned error: HTTP/1.1 502 Bad Gateway"
    HTTP_STATUS=${BASH_REMATCH[1]}
  else
    HTTP_STATUS=000
  fi
}

# PATCH the Caddy admin API. wget cannot send a PATCH, so the request is
# written to nc; HTTP/1.0 makes the server close the connection after the
# response. The status is only logged: whether the change was applied is
# decided by reading the upstream back.
admin_patch() {
  local path=$1 body=$2
  local raw

  raw=$(printf 'PATCH %s HTTP/1.0\r\nHost: %s:%s\r\nContent-Type: application/json\r\nContent-Length: %s\r\n\r\n%s' \
          "${path}" "${CADDY_ADMIN_HOST}" "${CADDY_ADMIN_PORT}" "${#body}" "${body}" \
        | timeout "${HTTP_TIMEOUT}" docker exec -i "${CADDY_CONTAINER}" nc -w "${HTTP_TIMEOUT}" "${CADDY_ADMIN_HOST}" "${CADDY_ADMIN_PORT}" 2>/dev/null) || true
  read -r HTTP_STATUS < <(json_tool http <<< "${raw}")
}

# Classify the /health response in HTTP_STATUS and HTTP_BODY.
# Sets CHECK to ok, transient or fatal, and H_ENV and H_BUILD.
classify_health() {
  local parsed
  H_ENV=""
  H_BUILD=""
  case ${HTTP_STATUS} in
    200) ;;
    000|5??) CHECK=transient; return 0 ;;
    *) CHECK=fatal; return 0 ;;
  esac
  parsed=$(json_tool health <<< "${HTTP_BODY}")
  if [[ ${parsed} == invalid ]]; then
    CHECK=fatal
    return 0
  fi
  read -r H_ENV H_BUILD <<< "${parsed}"
  undash H_ENV H_BUILD
  CHECK=ok
}

# /health as a client sees it: through Caddy, with the API host
routed_health() {
  caddy_get "http://127.0.0.1:${CADDY_HTTP_PORT}/health" "${API_HOST}"
  classify_health
}

# /health of an environment's container, asked from the Caddy container
direct_health() {
  caddy_get "http://${CONTAINER_PREFIX}-$1:4000/health"
  classify_health
}

dial_body() {
  echo "[{\"dial\":\"${CONTAINER_PREFIX}-$1:4000\"}]"
}

# The request that points Caddy at an environment, as a command a person can run
patch_command() {
  local body
  body=$(dial_body "$1")
  echo "printf 'PATCH ${SWITCH_PATH} HTTP/1.0\r\nHost: ${CADDY_ADMIN_HOST}:${CADDY_ADMIN_PORT}\r\nContent-Type: application/json\r\nContent-Length: ${#body}\r\n\r\n${body}' | docker exec -i ${CADDY_CONTAINER} nc -w ${HTTP_TIMEOUT} ${CADDY_ADMIN_HOST} ${CADDY_ADMIN_PORT}"
}

manual() {
  echo "MANUAL> $*"
}

# The image to deploy must be a digest reference in our repository.
validate_input() {
  local prefix="${IMAGE_REPO}@sha256:"
  local ref="${IMAGE_REF:-}"

  if [[ ${ref} != "${prefix}"* || ! ${ref#"${prefix}"} =~ ^[0-9a-f]{64}$ ]]; then
    error "IMAGE_REF must be ${prefix}<64 hex digits>, got '${ref}'"
    if [[ -n ${VERSION:-} ]]; then
      error "VERSION is no longer accepted; pass the image digest as IMAGE_REF"
    fi
    finish 1 INPUT_INVALID
  fi
  export IMAGE_REF GITHUB_REPO
  log "Deploying image: ${IMAGE_REF}"
}

# Find where Caddy sends backend traffic. The dial reported by the admin API is
# the truth; a PATCH response or the state file is not.
# Sets UP_OK. On success UP_PATH and UP_ENV, otherwise UP_REASON and UP_DETAIL.
query_upstream() {
  local verdict rest dial caddy_env

  UP_OK=false
  UP_PATH=""
  UP_ENV=""
  UP_REASON=UPSTREAM_QUERY_FAILED

  container_info "${CADDY_CONTAINER}"
  if [[ -z ${C_ID} || ${C_RUNNING} != true ]]; then
    UP_DETAIL="Caddy container ${CADDY_CONTAINER} is not running"
    return 0
  fi
  caddy_env=${C_ACTIVE_ENV}

  caddy_get "http://${CADDY_ADMIN_HOST}:${CADDY_ADMIN_PORT}/config/apps/http/servers"
  if [[ ${HTTP_STATUS} != 200 ]]; then
    UP_DETAIL="Caddy admin API did not answer (status ${HTTP_STATUS})"
    return 0
  fi

  read -r verdict rest < <(json_tool upstreams "${API_HOST}" "${CONTAINER_PREFIX}" <<< "${HTTP_BODY}")
  if [[ ${verdict} != ok ]]; then
    UP_REASON=${rest%% *}
    UP_DETAIL=${rest#* }
    return 0
  fi
  UP_PATH=${rest%% *}
  dial=${rest#* }

  if [[ -n ${CADDY_UPSTREAM_PATH} && ${CADDY_UPSTREAM_PATH} != "${UP_PATH}" ]]; then
    UP_REASON=UPSTREAM_PATH_MISMATCH
    UP_DETAIL="CADDY_UPSTREAM_PATH is ${CADDY_UPSTREAM_PATH} but the backend upstream is at ${UP_PATH}"
    return 0
  fi

  case ${dial} in
    "${CONTAINER_PREFIX}-blue:4000") UP_ENV=blue ;;
    "${CONTAINER_PREFIX}-green:4000") UP_ENV=green ;;
    "${CONTAINER_PREFIX}-{env.ACTIVE_ENV}:4000")
      # Caddy re-read its Caddyfile; the placeholder resolves from its own environment
      if [[ ${caddy_env} != blue && ${caddy_env} != green ]]; then
        UP_REASON=UPSTREAM_ENV_UNRESOLVED
        UP_DETAIL="the dial is ${dial} but ACTIVE_ENV of the Caddy container is '${caddy_env}'"
        return 0
      fi
      UP_ENV=${caddy_env}
      ;;
    *)
      UP_REASON=UPSTREAM_TARGET_UNKNOWN
      UP_DETAIL="the dial ${dial} is not a known backend"
      return 0
      ;;
  esac
  UP_OK=true
}

# Decide which environment serves, and make the state file agree with it.
# Sets ACTIVE_ENV, INACTIVE_ENV, RECOVERY, OLD_ID, OLD_IMAGE_ID, OLD_BUILD and OLD_REF.
resolve_serving() {
  local name body parsed internal_env internal_build

  query_upstream
  if [[ ${UP_OK} == false ]]; then
    error "Cannot determine the upstream: ${UP_DETAIL}"
    finish 1 "${UP_REASON}"
  fi
  log "Upstream ${UP_PATH} points at ${UP_ENV}"
  SWITCH_PATH=${UP_PATH}

  ACTIVE_ENV=${UP_ENV}
  INACTIVE_ENV=$(other_env "${UP_ENV}")
  RECOVERY=false
  OLD_IMAGE_ID=""
  OLD_BUILD=""
  OLD_REF=""
  name="${CONTAINER_PREFIX}-${ACTIVE_ENV}"
  container_info "${name}"
  OLD_ID=${C_ID}

  if [[ -z ${C_ID} || ${C_RUNNING} != true ]]; then
    if [[ ${STATE_ACTIVE} != "${ACTIVE_ENV}" ]]; then
      error "Caddy points at ${ACTIVE_ENV}, which is not running, while the state file names ${STATE_ACTIVE}"
      error "Nothing was changed. Check ${CONTAINER_PREFIX}-${STATE_ACTIVE}; if it is healthy, point Caddy at it:"
      container_info "${CONTAINER_PREFIX}-${STATE_ACTIVE}"
      if [[ ${C_RUNNING} == true ]]; then
        manual "$(patch_command "${STATE_ACTIVE}")"
      fi
      finish 1 UPSTREAM_DEAD
    fi
    warning "${name} is not running: nothing is serving, continuing as a recovery deployment"
    RECOVERY=true
    return 0
  fi

  image_info "${C_IMAGE}" "${STATE_IMAGE}"
  OLD_IMAGE_ID=${IMG_ID}
  OLD_BUILD=${IMG_BUILD}
  OLD_REF=${IMG_REF}
  if [[ -z ${OLD_REF} ]]; then
    error "The image of ${name} cannot be resolved to a digest in ${IMAGE_REPO}"
    finish 1 SERVING_IMAGE_UNKNOWN
  fi
  if [[ -z ${OLD_BUILD} ]]; then
    error "${name} runs an image without a build identifier, so its responses cannot be told apart"
    error "Deploy a backend whose /health reports env and build with the previous script first"
    finish 1 SERVING_NO_IDENTIFIER
  fi

  body=$(docker exec "${OLD_ID}" wget -qO- -T "${HTTP_TIMEOUT}" http://localhost:4000/health 2>/dev/null) || body=""
  parsed=$(json_tool health <<< "${body}")
  read -r internal_env internal_build _ <<< "${parsed} - -"
  if [[ ${internal_env} != "${ACTIVE_ENV}" || ${internal_build} != "${OLD_BUILD}" ]]; then
    error "${name} does not answer /health as ${ACTIVE_ENV}/${OLD_BUILD} (got '${parsed}')"
    error "Nothing was changed. If it is broken beyond repair, remove it and run again for a recovery deployment"
    finish 1 SERVING_UNVERIFIED
  fi

  routed_health
  if [[ ${CHECK} != ok || ${H_ENV} != "${ACTIVE_ENV}" || ${H_BUILD} != "${OLD_BUILD}" ]]; then
    error "Caddy does not serve ${ACTIVE_ENV}/${OLD_BUILD} for ${API_HOST} (status ${HTTP_STATUS}, env '${H_ENV}', build '${H_BUILD}')"
    finish 1 SERVING_UNVERIFIED
  fi
  success "${name} serves ${OLD_REF}"

  if [[ ${STATE_ACTIVE} != "${ACTIVE_ENV}" || ${STATE_IMAGE} != "${OLD_REF}" ]]; then
    warning "State file says ${STATE_ACTIVE}/${STATE_IMAGE:-unknown}; correcting it to the verified upstream"
    save_state "${ACTIVE_ENV}" "${OLD_REF}"
    if [[ ${STATE_SAVED} == false ]]; then
      error "Cannot write ${STATE_FILE}"
      finish 1 STATE_SAVE_FAILED
    fi
  fi
}

# Stop and remove a container that must not be serving. The upstream is read
# again right before; nothing is sent when the container is, or may be, the
# target. Sets REMOVED, and REMOVE_REFUSED when the upstream forbade it.
remove_container() {
  local env=$1 id=$2 grace=$3

  REMOVED=false
  REMOVE_REFUSED=false
  query_upstream
  if [[ ${UP_OK} == false || ${UP_ENV} == "${env}" ]]; then
    warning "Not removing ${CONTAINER_PREFIX}-${env}: the upstream is ${UP_ENV:-unknown}"
    REMOVE_REFUSED=true
    return 0
  fi
  if docker stop -t "${grace}" "${id}" > /dev/null && docker rm "${id}" > /dev/null; then
    REMOVED=true
  else
    warning "Could not remove ${CONTAINER_PREFIX}-${env} (${id}); the next run removes it"
  fi
}

# Remove the new container after a failed deployment. If the upstream cannot
# be read, or points at it, serving is not confirmed and the run ends with 2.
discard_new_container() {
  remove_container "${INACTIVE_ENV}" "${NEW_ID}" 10
  if [[ ${REMOVE_REFUSED} == true ]]; then
    error "The upstream is ${UP_ENV:-unknown}; ${CONTAINER_PREFIX}-${INACTIVE_ENV} is kept"
    finish 2 UPSTREAM_CHANGED
  fi
}

# Before the switch, Caddy must reach the new container and get the new build
check_reachable_from_caddy() {
  direct_health "${INACTIVE_ENV}"
  if [[ ${CHECK} != ok || ${H_ENV} != "${INACTIVE_ENV}" || ${H_BUILD} != "${NEW_BUILD}" ]]; then
    error "Caddy cannot reach ${CONTAINER_PREFIX}-${INACTIVE_ENV} as ${INACTIVE_ENV}/${NEW_BUILD} (status ${HTTP_STATUS}, env '${H_ENV}', build '${H_BUILD}')"
    discard_new_container
    finish 1 NEW_UNREACHABLE
  fi
  success "Caddy reaches ${CONTAINER_PREFIX}-${INACTIVE_ENV}"
}

# Ask Caddy to send backend traffic to an environment, then read the upstream
# back. The response to the PATCH decides nothing. Sets UP_OK and UP_ENV.
point_caddy_at() {
  admin_patch "${SWITCH_PATH}" "$(dial_body "$1")"
  log "PATCH to ${CONTAINER_PREFIX}-$1 answered with status ${HTTP_STATUS}"
  query_upstream
}

# Check that Caddy serves <env> with <build>. A connection error, timeout or
# 5xx may happen once, but not on the last request; any other mismatch fails at
# once. Sets VERIFIED.
verify_serving() {
  local want_env=$1 want_build=$2
  local started now i transients=0

  VERIFIED=false
  started=$(date +%s)
  for ((i = 1; i <= VERIFY_CHECKS; i++)); do
    routed_health
    now=$(date +%s)
    if ((now - started > VERIFY_MAX)); then
      error "Verification took longer than ${VERIFY_MAX}s"
      return 0
    fi
    if [[ ${CHECK} == fatal ]]; then
      error "Check ${i}/${VERIFY_CHECKS}: unusable response (status ${HTTP_STATUS})"
      return 0
    fi
    if [[ ${CHECK} == transient ]]; then
      transients=$((transients + 1))
      warning "Check ${i}/${VERIFY_CHECKS}: no usable response (status ${HTTP_STATUS})"
      if ((transients > 1 || i == VERIFY_CHECKS)); then
        error "Too many failed checks, or the last one failed"
        return 0
      fi
    elif [[ ${H_ENV} != "${want_env}" || ${H_BUILD} != "${want_build}" ]]; then
      error "Check ${i}/${VERIFY_CHECKS}: got ${H_ENV:-?}/${H_BUILD:-?}, expected ${want_env}/${want_build}"
      return 0
    else
      log "Check ${i}/${VERIFY_CHECKS}: ${H_ENV}/${H_BUILD}"
    fi
    if ((i < VERIFY_CHECKS)); then
      sleep "${VERIFY_INTERVAL}"
    fi
  done
  VERIFIED=true
}

# Neither container is removed; print how to switch by hand. The argument is
# the environment that should serve if it turns out to be healthy.
keep_both() {
  local other
  other=$(other_env "$1")
  error "Both containers are kept. Check ${CONTAINER_PREFIX}-$1; to send traffic to it:"
  manual "$(patch_command "$1")"
  error "To send traffic to ${CONTAINER_PREFIX}-${other} instead:"
  printf '  %s\n' "$(patch_command "${other}")" >&2
  error "State file ${STATE_FILE} was not changed; the next run starts from the actual upstream"
}

# Send traffic back to the old environment. The failed new environment is
# removed only after the return is confirmed.
rollback() {
  error "🔄 ROLLBACK: switching back to ${CONTAINER_PREFIX}-${ACTIVE_ENV}"
  point_caddy_at "${ACTIVE_ENV}"
  if [[ ${UP_OK} == true && ${UP_ENV} == "${ACTIVE_ENV}" ]]; then
    verify_serving "${ACTIVE_ENV}" "${OLD_BUILD}"
    if [[ ${VERIFIED} == true ]]; then
      success "Traffic is back on ${CONTAINER_PREFIX}-${ACTIVE_ENV}"
      discard_new_container
      finish 1 ROLLED_BACK
    fi
  fi
  error "⚠️  CRITICAL: the rollback could not be confirmed (upstream: ${UP_ENV:-unknown})"
  keep_both "${ACTIVE_ENV}"
  finish 2 ROLLBACK_UNCONFIRMED
}

# Switch Caddy to the new environment and verify it through Caddy.
switch_traffic() {
  log "Switching traffic from ${ACTIVE_ENV} to ${INACTIVE_ENV}"
  point_caddy_at "${INACTIVE_ENV}"

  if [[ ${UP_OK} == false ]]; then
    error "The upstream cannot be read back after the PATCH: ${UP_DETAIL}"
    keep_both "${ACTIVE_ENV}"
    finish 2 SWITCH_UNKNOWN
  fi

  if [[ ${UP_ENV} != "${INACTIVE_ENV}" ]]; then
    error "The switch was not applied; the upstream is still ${UP_ENV}"
    if [[ ${RECOVERY} == true ]]; then
      keep_both "${INACTIVE_ENV}"
      finish 2 RECOVERY_FAILED
    fi
    verify_serving "${ACTIVE_ENV}" "${OLD_BUILD}"
    if [[ ${VERIFIED} == false ]]; then
      keep_both "${ACTIVE_ENV}"
      finish 2 SWITCH_UNKNOWN
    fi
    discard_new_container
    finish 1 SWITCH_NOT_APPLIED
  fi

  verify_serving "${INACTIVE_ENV}" "${NEW_BUILD}"
  if [[ ${VERIFIED} == true ]]; then
    success "Caddy serves ${INACTIVE_ENV}/${NEW_BUILD}"
    return 0
  fi

  if [[ ${RECOVERY} == true ]]; then
    error "The old environment was not running, so there is nothing to roll back to"
    keep_both "${INACTIVE_ENV}"
    finish 2 RECOVERY_FAILED
  fi
  rollback
}

state_invalid() {
  error "State file is not valid: $*"
  error "Fix or recreate ${STATE_FILE} from the actual upstream (see --find-upstream)"
  finish 1 STATE_INVALID
}

# Load deployment state. The file is parsed line by line and never executed.
# Sets STATE_ACTIVE, STATE_INACTIVE and STATE_IMAGE.
read_state() {
  if [[ ! -f "$STATE_FILE" ]]; then
    error "State file not found: $STATE_FILE"
    error "Run './scripts/init-setup-deployment.sh' first"
    finish 1 STATE_MISSING
  fi

  STATE_ACTIVE=""
  STATE_INACTIVE=""
  STATE_IMAGE=""
  local line key value seen=" "

  while IFS= read -r line || [[ -n ${line} ]]; do
    if [[ ! ${line} =~ ^([A-Z_]+)=([A-Za-z0-9._:/@-]*)$ ]]; then
      state_invalid "unexpected line"
    fi
    key=${BASH_REMATCH[1]}
    value=${BASH_REMATCH[2]}
    if [[ ${seen} == *" ${key} "* ]]; then
      state_invalid "duplicate key ${key}"
    fi
    seen+="${key} "
    case ${key} in
      ACTIVE_ENV) STATE_ACTIVE=${value} ;;
      INACTIVE_ENV) STATE_INACTIVE=${value} ;;
      ACTIVE_IMAGE) STATE_IMAGE=${value} ;;
      UPDATED_AT) ;;
      # Keys of the previous format are read and dropped
      ACTIVE_PORT|INACTIVE_PORT|LAST_DEPLOYMENT|VERSION) ;;
      *) state_invalid "unexpected key ${key}" ;;
    esac
  done < "$STATE_FILE"

  if [[ ${STATE_ACTIVE} != blue && ${STATE_ACTIVE} != green ]]; then
    state_invalid "ACTIVE_ENV must be blue or green"
  fi
  if [[ ${STATE_INACTIVE} != "$(other_env "${STATE_ACTIVE}")" ]]; then
    state_invalid "INACTIVE_ENV must be the other environment"
  fi
  if [[ -n ${STATE_IMAGE} && ! ${STATE_IMAGE} =~ @sha256:[0-9a-f]{64}$ ]]; then
    state_invalid "ACTIVE_IMAGE must be a digest reference"
  fi

  log "Current state loaded:"
  log "  ACTIVE: ${STATE_ACTIVE}"
  log "  IMAGE: ${STATE_IMAGE:-unknown}"
}

# Save deployment state by replacing the file in one step. Caddy's compose
# reads this file as env_file, so the format stays unquoted KEY=VALUE.
# Sets STATE_SAVED to true or false.
save_state() {
  local active=$1 image=$2
  local tmp="${STATE_FILE}.tmp.$$"
  local stamp
  stamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  STATE_SAVED=false
  if printf 'ACTIVE_ENV=%s\nINACTIVE_ENV=%s\nACTIVE_IMAGE=%s\nUPDATED_AT=%s\n' \
       "${active}" "$(other_env "${active}")" "${image}" "${stamp}" > "${tmp}" \
     && mv "${tmp}" "$STATE_FILE"; then
    STATE_SAVED=true
    success "State updated: ${active} is now active with ${image}"
  fi
}

# Pull the requested image and read its identity
pull_image() {
  local attempt
  for attempt in 1 2 3; do
    log "Pull attempt ${attempt}/3..."
    if docker pull "${IMAGE_REF}"; then
      success "Image pulled successfully"
      break
    fi
    warning "Pull failed (attempt ${attempt}/3)"
    if [[ ${attempt} == 3 ]]; then
      error "Failed to pull ${IMAGE_REF}"
      finish 1 PULL_FAILED
    fi
    sleep 5
  done

  image_info "${IMAGE_REF}"
  NEW_IMAGE_ID=${IMG_ID}
  NEW_BUILD=${IMG_BUILD}
  if [[ -z ${NEW_IMAGE_ID} ]]; then
    error "Pulled image cannot be inspected: ${IMAGE_REF}"
    finish 1 PULL_FAILED
  fi
  if [[ -z ${NEW_BUILD} ]]; then
    error "Image has no build identifier (BUILD_SHA): ${IMAGE_REF}"
    error "Images built before /health reported env and build cannot be deployed"
    finish 1 IMAGE_NO_IDENTIFIER
  fi
  log "Image ${NEW_IMAGE_ID} was built from ${NEW_BUILD}"
}

# Start inactive environment
start_inactive_env() {
  log "Starting ${INACTIVE_ENV} environment"

  # A container left in the non-serving slot is never reused, whatever state
  # docker reports for it: it is force-removed and a new one is created.
  container_info "${CONTAINER_PREFIX}-${INACTIVE_ENV}"
  if [[ -n ${C_ID} ]]; then
    local stale=${C_ID}
    log "Removing leftover ${INACTIVE_ENV} container ${stale}..."
    query_upstream
    if [[ ${UP_OK} == false || ${UP_ENV} != "${ACTIVE_ENV}" ]]; then
      error "The upstream changed during the run (now ${UP_ENV:-unknown}); nothing was removed"
      finish 2 UPSTREAM_CHANGED
    fi
    docker rm -f "${stale}" > /dev/null || true
    container_info "${stale}"
    if [[ -n ${C_ID} ]]; then
      error "Leftover container ${stale} could not be removed"
      finish 1 STALE_REMOVE_FAILED
    fi
  fi

  # Start with profile
  log "Starting backend-${INACTIVE_ENV}..."
  if ! docker compose -f "${COMPOSE_FILE}" --profile "${INACTIVE_ENV}" ${DB_PROFILE} up -d --no-deps --force-recreate "backend-${INACTIVE_ENV}"; then
    error "Failed to start ${INACTIVE_ENV} environment"
    finish 1 START_FAILED
  fi

  container_info "${CONTAINER_PREFIX}-${INACTIVE_ENV}"
  NEW_ID=${C_ID}
  if [[ -z ${NEW_ID} ]]; then
    error "${CONTAINER_PREFIX}-${INACTIVE_ENV} does not exist after compose up"
    finish 1 START_FAILED
  fi
  success "${INACTIVE_ENV} environment started (${NEW_ID})"
}

# The new container must run the image that was requested
verify_new_image() {
  container_info "${CONTAINER_PREFIX}-${INACTIVE_ENV}"
  if [[ ${C_IMAGE} != "${NEW_IMAGE_ID}" ]]; then
    error "New container runs ${C_IMAGE:-nothing}, expected ${NEW_IMAGE_ID}"
    discard_new_container
    finish 1 IMAGE_MISMATCH
  fi
  success "New container runs the requested image"
}

# Wait for the new container to report healthy. Sets NEW_HEALTHY.
wait_for_healthy() {
  local started now

  NEW_HEALTHY=false
  log "Waiting for ${INACTIVE_ENV} to become healthy (max ${HEALTH_CHECK_MAX_WAIT}s)..."
  started=$(date +%s)

  while true; do
    container_info "${NEW_ID}"
    if [[ -z ${C_ID} ]]; then
      error "Container ${NEW_ID} not found"
      return 0
    fi
    if [[ ${C_HEALTH} == healthy ]]; then
      NEW_HEALTHY=true
      success "${INACTIVE_ENV} is healthy!"
      return 0
    fi

    now=$(date +%s)
    if ((now - started >= HEALTH_CHECK_MAX_WAIT)); then
      error "${INACTIVE_ENV} failed to become healthy within ${HEALTH_CHECK_MAX_WAIT}s"
      error "Last health status: ${C_HEALTH:-none}"
      return 0
    fi
    log "  Status: ${C_HEALTH:-none}"
    sleep "${HEALTH_CHECK_INTERVAL}"
  done
}

# Remove the old environment after the switch. The upstream is read once more:
# if Caddy went back to the old environment, it is still serving and stays.
cleanup_old_env() {
  if [[ -z ${OLD_ID} ]]; then
    return 0
  fi
  log "Stopping old ${ACTIVE_ENV} container ${OLD_ID}..."
  remove_container "${ACTIVE_ENV}" "${OLD_ID}" 30
  if [[ ${REMOVE_REFUSED} == true ]]; then
    error "Caddy no longer points at ${INACTIVE_ENV}, which was verified a moment ago"
    error "Both containers are kept. Recreating the Caddy container makes it read ${STATE_FILE} again"
    finish 2 UPSTREAM_CHANGED
  fi
  if [[ ${REMOVED} == true ]]; then
    success "Old ${ACTIVE_ENV} environment cleaned up"
  fi
}

# Keep the image now serving and the one that served before, so the previous
# digest can be deployed again. "docker image prune" is not used: it would
# delete the previous image, which has no tag.
cleanup_old_images() {
  local ids id
  ids=$(docker image ls --no-trunc --format '{{.ID}}' "${IMAGE_REPO}" 2>/dev/null) || ids=""
  for id in $(sort -u <<< "${ids}"); do
    if [[ ${id} == "${NEW_IMAGE_ID}" || ${id} == "${OLD_IMAGE_ID}" ]]; then
      continue
    fi
    if docker rmi -f "${id}" > /dev/null 2>&1; then
      log "Removed old image ${id}"
    else
      warning "Could not remove image ${id}"
    fi
  done
}

# Show deployment banner
show_banner() {
  echo ""
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║           BLUE-GREEN DEPLOYMENT STARTED                    ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""
  echo "  Image: ${IMAGE_REF}"
  echo "  Active → Inactive: ${ACTIVE_ENV} → ${INACTIVE_ENV}"
  echo ""
}

# Show deployment summary
show_summary() {
  echo ""
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║           DEPLOYMENT SUCCESSFUL                            ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""
  echo "  Active Environment: ${INACTIVE_ENV}"
  echo "  Image: ${IMAGE_REF}"
  echo "  Build: ${NEW_BUILD}"
  echo ""
}

# Main deployment flow
main() {
  install_traps
  validate_input
  acquire_lock

  log "📋 Loading deployment state..."
  read_state
  echo ""

  log "🔍 Checking what Caddy serves..."
  resolve_serving
  echo ""

  show_banner

  log "📦 Pulling Docker image from GHCR..."
  pull_image
  echo ""

  log "🚀 Starting inactive environment..."
  start_inactive_env
  echo ""

  log "🏥 Performing health checks..."
  wait_for_healthy
  if [[ ${NEW_HEALTHY} == false ]]; then
    error "Deployment failed: ${INACTIVE_ENV} is unhealthy"
    echo ""
    error "Logs from ${INACTIVE_ENV}:"
    docker logs --tail 50 "${NEW_ID}" || true
    echo ""
    log "Cleaning up failed deployment..."
    discard_new_container
    finish 1 NEW_UNHEALTHY
  fi
  verify_new_image
  check_reachable_from_caddy
  echo ""

  log "🔀 Switching traffic to new environment..."
  switch_traffic
  echo ""

  log "💾 Updating deployment state..."
  save_state "${INACTIVE_ENV}" "${IMAGE_REF}"
  if [[ ${STATE_SAVED} == false ]]; then
    error "Cannot write ${STATE_FILE}; ${INACTIVE_ENV} is serving but not recorded"
    error "Both containers are kept and nothing is rolled back. Fix the cause and run again"
    finish 2 STATE_SAVE_FAILED
  fi
  echo ""

  log "🧹 Cleaning up old environment..."
  cleanup_old_env
  cleanup_old_images
  echo ""

  show_summary

  success "🎉 Deployment complete!"
  finish 0 OK
}

# Execute based on mode
if [[ "${FIND_UPSTREAM_ONLY}" == "true" ]]; then
  # Read-only: detect and display the path, without the lock
  query_upstream
  if [[ ${UP_OK} == true ]]; then
    success "Upstream path: ${UP_PATH}"
    success "Current upstream: ${CONTAINER_PREFIX}-${UP_ENV}:4000"
    exit 0
  fi
  error "Failed to detect the upstream (${UP_REASON}): ${UP_DETAIL}"
  exit 1
else
  # Normal deployment mode
  main "$@"
fi
