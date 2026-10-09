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
#   1  INPUT_INVALID LOCK_HELD STATE_MISSING STATE_INVALID PULL_FAILED IMAGE_NO_IDENTIFIER
#      UPSTREAM_UNKNOWN START_FAILED NEW_UNHEALTHY IMAGE_MISMATCH ROLLED_BACK
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
CADDY_ADMIN_API="http://127.0.0.1:2019"  # Internal to Caddy container (IPv4 only)
CADDY_UPSTREAM_PATH="${CADDY_UPSTREAM_PATH:-}"  # Auto-detect or set via env var

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

# Read fields out of docker's JSON output. Prints one line of space-separated
# fields, "-" for a field that is missing.
json_tool() {
  python3 -c '
import json, re, sys

def field(value):
    value = str(value or "")
    return value if re.fullmatch(r"[A-Za-z0-9._:/@-]+", value) else "-"

def env_of(data):
    entries = (data.get("Config") or {}).get("Env") or []
    return dict(e.split("=", 1) for e in entries if "=" in e)

cmd = sys.argv[1]
try:
    data = json.load(sys.stdin)[0]
except Exception:
    data = None

if cmd == "image":
    # <image id> <build> <digest reference in our repository>
    if data is None:
        print("- - -")
    else:
        build = env_of(data).get("BUILD_SHA", "")
        digests = sorted(d for d in data.get("RepoDigests") or [] if d.startswith(sys.argv[2] + "@"))
        print(field(data.get("Id")), field("" if build == "unknown" else build),
              field(digests[0] if digests else ""))
elif cmd == "container":
    # <container id> <image id> <running> <health>
    if data is None:
        print("- - - -")
    else:
        state = data.get("State") or {}
        print(field(data.get("Id")), field(data.get("Image")),
              "true" if state.get("Running") else "false",
              field((state.get("Health") or {}).get("Status")))
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
image_info() {
  local json
  json=$(docker image inspect "$1" 2>/dev/null) || json=""
  read -r IMG_ID IMG_BUILD IMG_REF < <(json_tool image "${IMAGE_REPO}" <<< "${json}")
  undash IMG_ID IMG_BUILD IMG_REF
}

# Sets C_ID, C_IMAGE, C_RUNNING and C_HEALTH for a container. C_ID is empty when it does not exist.
container_info() {
  local json
  json=$(docker inspect "$1" 2>/dev/null) || json=""
  read -r C_ID C_IMAGE C_RUNNING C_HEALTH < <(json_tool container <<< "${json}")
  undash C_ID C_IMAGE C_HEALTH
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

# Auto-detect Caddy upstream path for api.chatbotgate.click
# Handles nested subroute structures automatically
validate_caddy_upstream_path() {
  log "Detecting Caddy upstream path for api.chatbotgate.click..."

  # Verify Caddy container is running
  if ! docker ps --format '{{.Names}}' | grep -q "^${CADDY_CONTAINER}$"; then
    error "Caddy container ${CADDY_CONTAINER} is not running"
    return 1
  fi

  # If path already set via env var, validate it
  if [[ -n "${CADDY_UPSTREAM_PATH}" ]]; then
    log "Using provided path: ${CADDY_UPSTREAM_PATH}"
    if docker exec "${CADDY_CONTAINER}" wget -qO- "${CADDY_ADMIN_API}${CADDY_UPSTREAM_PATH}" > /dev/null 2>&1; then
      success "Caddy upstream path validated: ${CADDY_UPSTREAM_PATH}"
      return 0
    else
      warning "Provided path is invalid, attempting auto-detection..."
    fi
  fi

  # Fetch Caddy configuration
  local config
  config=$(docker exec "${CADDY_CONTAINER}" wget -qO- "${CADDY_ADMIN_API}/config/apps/http/servers" 2>/dev/null)

  if [ -z "$config" ]; then
    error "Failed to fetch Caddy configuration"
    return 1
  fi

  # Python-based recursive detection (handles nested subroutes)
  if ! command -v python3 &> /dev/null; then
    error "Python3 is required for auto-detection but not found"
    error "Install: apt-get install python3 or yum install python3"
    return 1
  fi

  local result
  result=$(echo "$config" | python3 -c '
import json, sys

def find_upstreams_path(routes, base_path, target_host="api.chatbotgate.click"):
    """Recursively search for upstreams in route handlers (including subroutes)"""
    for idx, route in enumerate(routes):
        # If target_host is set, check if this route matches
        if target_host:
            matches = route.get("match", [])
            host_found = False
            for match in matches:
                if target_host in match.get("host", []):
                    host_found = True
                    break

            if not host_found:
                continue

        # Found matching route (or no target_host filter), search handlers
        handlers = route.get("handle", [])
        path = search_handlers(handlers, f"{base_path}/routes/{idx}/handle")
        if path:
            return path

    return None

def search_handlers(handlers, base_path):
    """Search for upstreams in handler array (supports nested subroutes)"""
    for idx, handler in enumerate(handlers):
        handler_path = f"{base_path}/{idx}"

        # Direct upstreams found
        if "upstreams" in handler:
            for upstream in handler["upstreams"]:
                if "chatbot-gate-backend" in upstream.get("dial", ""):
                    return f"{handler_path}/upstreams"

        # Nested subroute handler
        if handler.get("handler") == "subroute":
            nested_routes = handler.get("routes", [])
            path = find_upstreams_path(nested_routes, handler_path, target_host=None)
            if path:
                return path

    return None

try:
    data = json.load(sys.stdin)
    for server_name, server_config in data.items():
        routes = server_config.get("routes", [])
        base_path = f"/config/apps/http/servers/{server_name}"
        result = find_upstreams_path(routes, base_path)
        if result:
            print(result)
            sys.exit(0)
except Exception:
    pass
' 2>/dev/null)

  if [[ -z "$result" ]]; then
    error "Could not find upstream path for api.chatbotgate.click"
    error "Set manually: export CADDY_UPSTREAM_PATH='/config/apps/http/servers/...'"
    return 1
  fi

  CADDY_UPSTREAM_PATH="$result"
  success "Auto-detected upstream path: ${CADDY_UPSTREAM_PATH}"

  # Show current upstream
  local current_upstream
  current_upstream=$(docker exec "${CADDY_CONTAINER}" wget -qO- "${CADDY_ADMIN_API}${CADDY_UPSTREAM_PATH}" 2>/dev/null | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    if data and len(data) > 0:
        print(data[0].get("dial", ""))
except:
    pass
' 2>/dev/null)

  if [[ -n "$current_upstream" ]]; then
    log "Current upstream: ${current_upstream}"
  fi

  return 0
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
  if ! docker exec "${CADDY_CONTAINER}" wget -qO- "${CADDY_ADMIN_API}/config/" > /dev/null 2>&1; then
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
      error "Verify Caddy API path with: docker exec ${CADDY_CONTAINER} wget -qO- ${CADDY_ADMIN_API}/config/"
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
  ACTIVE_ENV=${STATE_ACTIVE}
  INACTIVE_ENV=${STATE_INACTIVE}
  echo ""

  show_banner

  log "🔍 Validating Caddy upstream path..."
  if ! validate_caddy_upstream_path; then
    error "Caddy upstream path validation failed"
    finish 1 UPSTREAM_UNKNOWN
  fi
  echo ""

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
  # Find upstream mode - only detect and display path
  echo ""
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║        CADDY UPSTREAM PATH DETECTION                      ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""

  if validate_caddy_upstream_path; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✅ Success! Use this environment variable for deployment:"
    echo ""
    echo "  export CADDY_UPSTREAM_PATH='${CADDY_UPSTREAM_PATH}'"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    exit 0
  else
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "❌ Failed to detect upstream path"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    exit 1
  fi
else
  # Normal deployment mode
  main "$@"
fi
