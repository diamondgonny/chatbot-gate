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
#      PULL_FAILED IMAGE_NO_IDENTIFIER START_FAILED NEW_UNHEALTHY IMAGE_MISMATCH ROLLED_BACK
#   2  ROLLBACK_UNCONFIRMED INTERRUPTED UNCLASSIFIED
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
VALIDATION_PERIOD=10
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
    # Raw HTTP response -> status on the first line (000 without a response), then the body
    head, sep, body = raw.partition("\r\n\r\n")
    status = re.match(r"HTTP/\d\.\d (\d{3})", head)
    print(status.group(1) if status and sep else "000")
    sys.stdout.write(body)
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
container_info() {
  local json
  json=$(docker inspect "$1" 2>/dev/null) || json=""
  read -r C_ID C_IMAGE C_RUNNING C_HEALTH C_ACTIVE_ENV < <(json_tool container <<< "${json}")
  undash C_ID C_IMAGE C_HEALTH C_ACTIVE_ENV
}

# Send one HTTP request from inside the Caddy container.
# Usage: caddy_request <method> <host> <port> <path> [Host header] [body]
# Sets HTTP_STATUS (000 when no response arrived in time) and HTTP_BODY.
caddy_request() {
  local method=$1 host=$2 port=$3 path=$4 header=${5:-$2:$3} body=${6:-}
  local raw

  # HTTP/1.0 makes the server close the connection and send the body unchunked
  raw=$(printf '%s %s HTTP/1.0\r\nHost: %s\r\nContent-Type: application/json\r\nContent-Length: %s\r\n\r\n%s' \
          "${method}" "${path}" "${header}" "${#body}" "${body}" \
        | timeout "${HTTP_TIMEOUT}" docker exec -i "${CADDY_CONTAINER}" nc -w "${HTTP_TIMEOUT}" "${host}" "${port}" 2>/dev/null) || true
  {
    read -r HTTP_STATUS
    HTTP_BODY=$(cat)
  } < <(json_tool http <<< "${raw}")
}

admin_request() {
  caddy_request "$1" "${CADDY_ADMIN_HOST}" "${CADDY_ADMIN_PORT}" "$2" "${CADDY_ADMIN_HOST}:${CADDY_ADMIN_PORT}" "${3:-}"
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
  caddy_request GET 127.0.0.1 "${CADDY_HTTP_PORT}" /health "${API_HOST}"
  classify_health
}

dial_body() {
  echo "[{\"dial\":\"${CONTAINER_PREFIX}-$1:4000\"}]"
}

# The request that points Caddy at an environment, as a command a person can run
patch_command() {
  local body
  body=$(dial_body "$1")
  echo "printf 'PATCH ${UP_PATH} HTTP/1.0\r\nHost: ${CADDY_ADMIN_HOST}:${CADDY_ADMIN_PORT}\r\nContent-Type: application/json\r\nContent-Length: ${#body}\r\n\r\n${body}' | docker exec -i ${CADDY_CONTAINER} nc -w ${HTTP_TIMEOUT} ${CADDY_ADMIN_HOST} ${CADDY_ADMIN_PORT}"
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

  admin_request GET /config/apps/http/servers
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

# Validate Docker network connectivity
validate_networks() {
  log "Validating Docker network connectivity..."

  # Check network exists
  if ! docker network inspect caddy_upstream > /dev/null 2>&1; then
    error "caddy_upstream network does not exist"
    error "Create: docker network create caddy_upstream"
    return 1
  fi

  local container_name="chatbot-gate-backend-${INACTIVE_ENV}"

  # Verify container on network
  local network_check
  network_check=$(docker inspect "${container_name}" --format '{{json .NetworkSettings.Networks}}' | grep -c "caddy_upstream" || echo "0")

  if [ "$network_check" -eq 0 ]; then
    error "Container not on caddy_upstream network"
    return 1
  fi

  # Test DNS resolution from Caddy
  if docker exec caddy getent hosts "${container_name}" > /dev/null 2>&1; then
    success "Caddy can resolve ${container_name}"
  else
    warning "Caddy cannot resolve ${container_name} (may be OK if caddy not running)"
  fi

  return 0
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

  # Stop and remove if exists
  log "Cleaning up any existing ${INACTIVE_ENV} containers..."
  docker compose -f "${COMPOSE_FILE}" --profile "${INACTIVE_ENV}" ${DB_PROFILE} rm -s -f "backend-${INACTIVE_ENV}" 2>/dev/null || true

  # Start with profile
  log "Starting backend-${INACTIVE_ENV}..."
  if ! docker compose -f "${COMPOSE_FILE}" --profile "${INACTIVE_ENV}" ${DB_PROFILE} up -d --no-deps --force-recreate "backend-${INACTIVE_ENV}"; then
    error "Failed to start ${INACTIVE_ENV} environment"
    finish 1 START_FAILED
  fi

  success "${INACTIVE_ENV} environment started"
}

remove_inactive_env() {
  docker compose -f "${COMPOSE_FILE}" --profile "${INACTIVE_ENV}" ${DB_PROFILE} stop -t 10 "backend-${INACTIVE_ENV}" 2>/dev/null || true
  docker compose -f "${COMPOSE_FILE}" --profile "${INACTIVE_ENV}" ${DB_PROFILE} rm -f "backend-${INACTIVE_ENV}" 2>/dev/null || true
}

# The new container must run the image that was requested
verify_new_image() {
  container_info "${CONTAINER_PREFIX}-${INACTIVE_ENV}"
  if [[ ${C_IMAGE} != "${NEW_IMAGE_ID}" ]]; then
    error "New container runs ${C_IMAGE:-nothing}, expected ${NEW_IMAGE_ID}"
    remove_inactive_env
    finish 1 IMAGE_MISMATCH
  fi
  success "New container runs the requested image"
}

# Wait for the new container to report healthy. Sets NEW_HEALTHY.
wait_for_healthy() {
  local container_name="${CONTAINER_PREFIX}-${INACTIVE_ENV}"
  local started now

  NEW_HEALTHY=false
  log "Waiting for ${INACTIVE_ENV} to become healthy (max ${HEALTH_CHECK_MAX_WAIT}s)..."
  started=$(date +%s)

  while true; do
    container_info "${container_name}"
    if [[ -z ${C_ID} ]]; then
      error "Container ${container_name} not found"
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

# Switch Caddy upstream
switch_traffic() {
  local container_name="chatbot-gate-backend-${INACTIVE_ENV}"
  log "Switching traffic from ${ACTIVE_ENV} to ${container_name}"

  # Verify Caddy container is running
  if ! docker ps --format '{{.Names}}' | grep -q "^${CADDY_CONTAINER}$"; then
    error "Caddy container ${CADDY_CONTAINER} is not running"
    return 1
  fi

  # Verify Caddy Admin API accessible (via docker exec)
  if ! docker exec "${CADDY_CONTAINER}" wget -qO- "http://${CADDY_ADMIN_HOST}:${CADDY_ADMIN_PORT}/config/" > /dev/null 2>&1; then
    error "Caddy Admin API not accessible inside container"
    error "Make sure Caddy is running properly"
    return 1
  fi

  # Verify container exists and is on network
  if ! docker inspect "${container_name}" > /dev/null 2>&1; then
    error "Container ${container_name} does not exist"
    return 1
  fi

  # Update Caddy upstream via Admin API (via docker exec using sh + nc)
  local response
  local json_data="[{\"dial\": \"${container_name}:4000\"}]"
  local content_length=${#json_data}

  response=$(docker exec "${CADDY_CONTAINER}" sh -c "
    printf 'PATCH ${CADDY_UPSTREAM_PATH} HTTP/1.1\r\n'
    printf 'Host: 127.0.0.1:2019\r\n'
    printf 'Content-Type: application/json\r\n'
    printf 'Content-Length: ${content_length}\r\n'
    printf '\r\n'
    printf '${json_data}'
  " | docker exec -i "${CADDY_CONTAINER}" nc 127.0.0.1 2019 2>&1) || {
      error "Failed to update Caddy upstream"
      error "Response: ${response}"
      error "Current path: ${CADDY_UPSTREAM_PATH}"
      return 1
    }

  success "Traffic switched to ${container_name}:4000"
  return 0
}

# Validate new environment
validate_deployment() {
  local container_name="chatbot-gate-backend-${INACTIVE_ENV}"
  log "Validating ${container_name} for ${VALIDATION_PERIOD}s..."

  local checks=0
  local failures=0
  local max_checks=$((VALIDATION_PERIOD / 2))

  while [ $checks -lt $max_checks ]; do
    # Health check via docker exec (no port binding needed)
    if ! docker exec "${container_name}" wget -qO- http://localhost:4000/health > /dev/null 2>&1; then
      failures=$((failures + 1))
      warning "Health check failed (${failures} failures)"
    else
      echo -ne "\r  Validation: ${checks}/${max_checks} checks, ${failures} failures"
    fi

    sleep 2
    checks=$((checks + 1))
  done

  echo "" # New line after progress

  # Allow up to 1 transient failure
  if [ $failures -gt 1 ]; then
    error "Too many health check failures: ${failures}"
    return 1
  fi

  success "Validation passed (${checks} checks, ${failures} failures)"
  return 0
}

# Rollback function
rollback() {
  local active_container="chatbot-gate-backend-${ACTIVE_ENV}"
  error "🔄 ROLLBACK: Switching back to ${active_container}"

  # Switch traffic back to active environment (via docker exec using sh + nc)
  log "Reverting Caddy upstream to ${active_container}..."
  local response
  local json_data="[{\"dial\": \"${active_container}:4000\"}]"
  local content_length=${#json_data}

  response=$(docker exec "${CADDY_CONTAINER}" sh -c "
    printf 'PATCH ${CADDY_UPSTREAM_PATH} HTTP/1.1\r\n'
    printf 'Host: 127.0.0.1:2019\r\n'
    printf 'Content-Type: application/json\r\n'
    printf 'Content-Length: ${content_length}\r\n'
    printf '\r\n'
    printf '${json_data}'
  " | docker exec -i "${CADDY_CONTAINER}" nc 127.0.0.1 2019 2>&1) || {
      error "⚠️  CRITICAL: Rollback failed - manual intervention required!"
      error "Manual command:"
      error "docker exec ${CADDY_CONTAINER} sh -c \"printf 'PATCH ${CADDY_UPSTREAM_PATH} HTTP/1.1\\r\\n'; printf 'Host: 127.0.0.1:2019\\r\\n'; printf 'Content-Type: application/json\\r\\n'; printf 'Content-Length: ${content_length}\\r\\n'; printf '\\r\\n'; printf '${json_data}'\" | docker exec -i ${CADDY_CONTAINER} nc 127.0.0.1 2019"
      finish 2 ROLLBACK_UNCONFIRMED
    }

  success "Traffic reverted to ${active_container}:4000"

  # Stop failed inactive environment
  log "Stopping failed ${INACTIVE_ENV} environment..."
  remove_inactive_env

  error "Rollback complete - ${ACTIVE_ENV} is serving traffic"
  finish 1 ROLLED_BACK
}

# Cleanup old environment
cleanup_old_env() {
  log "Cleaning up old ${ACTIVE_ENV} environment..."

  # Graceful shutdown with 30s timeout
  log "Stopping ${ACTIVE_ENV} container..."
  docker compose -f "${COMPOSE_FILE}" --profile "${ACTIVE_ENV}" ${DB_PROFILE} stop -t 30 "backend-${ACTIVE_ENV}" 2>/dev/null || true

  # Remove container
  log "Removing ${ACTIVE_ENV} container..."
  docker compose -f "${COMPOSE_FILE}" --profile "${ACTIVE_ENV}" ${DB_PROFILE} rm -f "backend-${ACTIVE_ENV}" 2>/dev/null || true

  success "Old ${ACTIVE_ENV} environment cleaned up"
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
  CADDY_UPSTREAM_PATH=${UP_PATH}
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
    docker compose -f "${COMPOSE_FILE}" --profile "${INACTIVE_ENV}" ${DB_PROFILE} logs --tail=50 "backend-${INACTIVE_ENV}" || true
    echo ""
    log "Cleaning up failed deployment..."
    remove_inactive_env
    finish 1 NEW_UNHEALTHY
  fi
  verify_new_image
  echo ""

  log "🔌 Validating network connectivity..."
  if ! validate_networks; then
    error "Network validation failed"
    rollback
  fi
  echo ""

  log "🔀 Switching traffic to new environment..."
  if ! switch_traffic; then
    error "Failed to switch traffic"
    rollback
  fi
  echo ""

  log "✓ Validating deployment..."
  if ! validate_deployment; then
    error "Validation failed"
    rollback
  fi
  echo ""

  log "🧹 Cleaning up old environment..."
  cleanup_old_env
  echo ""

  log "💾 Updating deployment state..."
  save_state "${INACTIVE_ENV}" "${IMAGE_REF}"
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
