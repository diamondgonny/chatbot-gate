#!/bin/bash
set -euo pipefail

#############################################
# Blue-Green Deployment Script
# Zero-downtime deployment with automatic rollback
#
# Usage:
#   ./deploy-blue-green.sh                # Normal deployment
#   ./deploy-blue-green.sh --find-upstream # Find Caddy upstream path only
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
      shift
      ;;
  esac
done

# Colors for output (define early for use in validation)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

STATE_FILE="${REPO_ROOT}/.deployment-state"
COMPOSE_FILE="${REPO_ROOT}/docker-compose.yml"
IMAGE_NAME="chatbot-gate-backend"
GITHUB_REPO="${GITHUB_REPO:-owner/chatbot-gate}"
IMAGE_FULL_NAME="ghcr.io/${GITHUB_REPO}/chatbot-gate-backend"

# VERSION validation (skip for --find-upstream mode)
if [[ "${FIND_UPSTREAM_ONLY}" == "false" ]]; then
  VERSION="${VERSION:?VERSION environment variable is required}"

  # Validate VERSION is set and not empty
  if [[ -z "${VERSION}" ]]; then
    echo -e "${RED}ERROR: VERSION environment variable is not set${NC}"
    echo -e "${RED}This must be set by the CI/CD pipeline${NC}"
    exit 1
  fi
  echo -e "${BLUE}Deploying version: ${VERSION}${NC}"
fi

# Configuration
HEALTH_CHECK_MAX_WAIT=90
HEALTH_CHECK_INTERVAL=3
VALIDATION_PERIOD=10
CADDY_CONTAINER="caddy"  # Caddy container name
CADDY_ADMIN_API="http://localhost:2019"  # Internal to Caddy container
CADDY_UPSTREAM_PATH="${CADDY_UPSTREAM_PATH:-}"  # Auto-detect or set via env var

# Logging functions
log() {
  echo -e "${BLUE}$(date '+%Y-%m-%d %H:%M:%S')${NC} - $*"
}

error() {
  echo -e "${RED}$(date '+%Y-%m-%d %H:%M:%S') - ERROR:${NC} $*" >&2
}

success() {
  echo -e "${GREEN}$(date '+%Y-%m-%d %H:%M:%S') - ✅${NC} $*"
}

warning() {
  echo -e "${YELLOW}$(date '+%Y-%m-%d %H:%M:%S') - ⚠️${NC} $*"
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
  if ! docker network inspect caddy_downstream > /dev/null 2>&1; then
    error "caddy_downstream network does not exist"
    error "Create: docker network create caddy_downstream"
    return 1
  fi

  local container_name="chatbot-gate-backend-${INACTIVE_ENV}"

  # Verify container on network
  local network_check
  network_check=$(docker inspect "${container_name}" --format '{{json .NetworkSettings.Networks}}' | grep -c "caddy_downstream" || echo "0")

  if [ "$network_check" -eq 0 ]; then
    error "Container not on caddy_downstream network"
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

# Load deployment state
load_state() {
  if [[ ! -f "$STATE_FILE" ]]; then
    error "State file not found: $STATE_FILE"
    error "Run './scripts/init-setup-deployment.sh' first"
    exit 1
  fi

  # shellcheck source=/dev/null
  source "$STATE_FILE"

  log "Current state loaded:"
  log "  ACTIVE: ${ACTIVE_ENV} on port ${ACTIVE_PORT}"
  log "  INACTIVE: ${INACTIVE_ENV} on port ${INACTIVE_PORT}"
  log "  LAST DEPLOYMENT: ${LAST_DEPLOYMENT}"
  log "  VERSION: ${VERSION}"
}

# Save deployment state
save_state() {
  local new_active=$1
  local new_active_port=$2
  local new_inactive=$3
  local new_inactive_port=$4

  cat > "$STATE_FILE" << EOF
ACTIVE_ENV=${new_active}
ACTIVE_PORT=${new_active_port}
INACTIVE_ENV=${new_inactive}
INACTIVE_PORT=${new_inactive_port}
LAST_DEPLOYMENT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
VERSION=${VERSION}
EOF

  success "State updated: ${new_active} is now active on port ${new_active_port}"
}

# Pull image from GHCR
pull_image() {
  # Determine if VERSION is a full GHCR tag or just a tag name
  local PULL_TARGET
  local TAG_ONLY

  if [[ "$VERSION" == ghcr.io/* ]]; then
    # VERSION is a full GHCR tag (e.g., ghcr.io/owner/repo/chatbot-gate-backend:main-abc123)
    PULL_TARGET="$VERSION"
    TAG_ONLY=$(echo "$VERSION" | awk -F: '{print $NF}')
    log "Pulling image from GHCR (full tag): ${PULL_TARGET}"
  else
    # VERSION is just a tag name (e.g., abc123 or main-abc123)
    PULL_TARGET="${IMAGE_FULL_NAME}:${VERSION}"
    TAG_ONLY="$VERSION"
    log "Pulling image from GHCR: ${PULL_TARGET}"
  fi

  # Verify GHCR authentication
  if ! docker info | grep -q "Username:"; then
    warning "Not logged into GHCR - attempting login..."
    if [[ -n "${GHCR_TOKEN:-}" ]]; then
      echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USERNAME:-$USER}" --password-stdin
    else
      error "GHCR_TOKEN not set and not logged in to GHCR"
      exit 1
    fi
  fi

  # Pull with retry logic
  local retries=3
  local attempt=1

  while [ $attempt -le $retries ]; do
    log "Pull attempt ${attempt}/${retries}..."

    if docker pull "${PULL_TARGET}"; then
      success "Image pulled successfully"

      # Tag for docker-compose compatibility
      docker tag "${PULL_TARGET}" "${IMAGE_NAME}:${TAG_ONLY}" || true
      docker tag "${PULL_TARGET}" "${IMAGE_NAME}:latest" || true
      docker tag "${PULL_TARGET}" "${IMAGE_NAME}:${INACTIVE_ENV}-${TAG_ONLY}" || true

      return 0
    fi

    warning "Pull failed (attempt ${attempt}/${retries})"
    attempt=$((attempt + 1))
    sleep 5
  done

  error "Failed to pull image after ${retries} attempts"
  exit 1
}

# Start inactive environment
start_inactive_env() {
  log "Starting ${INACTIVE_ENV} environment on port ${INACTIVE_PORT}"

  # Stop and remove if exists
  log "Cleaning up any existing ${INACTIVE_ENV} containers..."
  docker compose -f "${COMPOSE_FILE}" --profile "${INACTIVE_ENV}" down 2>/dev/null || true

  # Start with profile
  log "Starting backend-${INACTIVE_ENV}..."
  if ! docker compose -f "${COMPOSE_FILE}" --profile "${INACTIVE_ENV}" up -d "backend-${INACTIVE_ENV}"; then
    error "Failed to start ${INACTIVE_ENV} environment"
    exit 1
  fi

  success "${INACTIVE_ENV} environment started"
}

# Health check function
wait_for_healthy() {
  local container_name="chatbot-gate-backend-${INACTIVE_ENV}"
  local waited=0

  log "Waiting for ${INACTIVE_ENV} to become healthy (max ${HEALTH_CHECK_MAX_WAIT}s)..."

  while [ $waited -lt $HEALTH_CHECK_MAX_WAIT ]; do
    # Check if container exists
    if ! docker ps --format '{{.Names}}' | grep -q "^${container_name}$"; then
      error "Container ${container_name} not found"
      return 1
    fi

    # Get health status
    HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$container_name" 2>/dev/null || echo "none")

    if [ "$HEALTH_STATUS" = "healthy" ]; then
      success "${INACTIVE_ENV} is healthy!"
      return 0
    fi

    # Show progress
    echo -ne "\r  Status: ${HEALTH_STATUS} (${waited}s/${HEALTH_CHECK_MAX_WAIT}s)..."

    sleep $HEALTH_CHECK_INTERVAL
    waited=$((waited + HEALTH_CHECK_INTERVAL))
  done

  echo "" # New line after progress
  error "${INACTIVE_ENV} failed to become healthy within ${HEALTH_CHECK_MAX_WAIT}s"
  error "Last health status: ${HEALTH_STATUS}"
  return 1
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
  if ! docker exec "${CADDY_CONTAINER}" curl -f -s "${CADDY_ADMIN_API}/config/" > /dev/null 2>&1; then
    error "Caddy Admin API not accessible inside container"
    error "Make sure Caddy is running properly"
    return 1
  fi

  # Verify container exists and is on network
  if ! docker inspect "${container_name}" > /dev/null 2>&1; then
    error "Container ${container_name} does not exist"
    return 1
  fi

  # Update Caddy upstream via Admin API (via docker exec)
  local response
  response=$(docker exec "${CADDY_CONTAINER}" curl -f -X PATCH "${CADDY_ADMIN_API}${CADDY_UPSTREAM_PATH}" \
    -H "Content-Type: application/json" \
    -d "[{\"dial\": \"${container_name}:4000\"}]" 2>&1) || {
      error "Failed to update Caddy upstream"
      error "Response: ${response}"
      error "Current path: ${CADDY_UPSTREAM_PATH}"
      error "Verify Caddy API path with: docker exec ${CADDY_CONTAINER} curl ${CADDY_ADMIN_API}/config/ | jq"
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
    if ! docker exec "${container_name}" curl -f -s http://localhost:4000/health > /dev/null 2>&1; then
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

  # Switch traffic back to active environment (via docker exec)
  log "Reverting Caddy upstream to ${active_container}..."
  local response
  response=$(docker exec "${CADDY_CONTAINER}" curl -f -X PATCH "${CADDY_ADMIN_API}${CADDY_UPSTREAM_PATH}" \
    -H "Content-Type: application/json" \
    -d "[{\"dial\": \"${active_container}:4000\"}]" 2>&1) || {
      error "⚠️  CRITICAL: Rollback failed - manual intervention required!"
      error "Manual command:"
      error "docker exec ${CADDY_CONTAINER} curl -X PATCH ${CADDY_ADMIN_API}${CADDY_UPSTREAM_PATH} \\"
      error "  -H 'Content-Type: application/json' \\"
      error "  -d '[{\"dial\": \"${active_container}:4000\"}]'"
      exit 2
    }

  success "Traffic reverted to ${active_container}:4000"

  # Stop failed inactive environment
  log "Stopping failed ${INACTIVE_ENV} environment..."
  docker compose -f "${COMPOSE_FILE}" --profile "${INACTIVE_ENV}" down || true

  # Log rollback event
  echo "ROLLBACK - $(date -u +"%Y-%m-%dT%H:%M:%SZ") - Attempted: ${INACTIVE_ENV} → Reverted to: ${ACTIVE_ENV} - Version: ${VERSION}" >> deployment-rollback.log

  error "Rollback complete - ${ACTIVE_ENV} is serving traffic"
  exit 1
}

# Cleanup old environment
cleanup_old_env() {
  log "Cleaning up old ${ACTIVE_ENV} environment..."

  # Graceful shutdown with 30s timeout
  log "Stopping ${ACTIVE_ENV} container..."
  docker compose -f "${COMPOSE_FILE}" --profile "${ACTIVE_ENV}" stop -t 30 "backend-${ACTIVE_ENV}" 2>/dev/null || true

  # Remove container
  log "Removing ${ACTIVE_ENV} container..."
  docker compose -f "${COMPOSE_FILE}" --profile "${ACTIVE_ENV}" rm -f "backend-${ACTIVE_ENV}" 2>/dev/null || true

  success "Old ${ACTIVE_ENV} environment cleaned up"
}

# Cleanup old images
cleanup_old_images() {
  log "Cleaning up old images..."

  # Remove dangling images
  docker image prune -f

  # Keep last 3 tagged versions of our image
  local old_images=$(docker images "${IMAGE_FULL_NAME}" --format "{{.ID}} {{.Tag}}" | \
    grep -v "${VERSION}" | \
    grep -v "latest" | \
    sort -r | \
    tail -n +4 | \
    awk '{print $1}')

  if [[ -n "$old_images" ]]; then
    log "Removing old image versions..."
    echo "$old_images" | xargs -r docker rmi -f || true
  fi

  success "Image cleanup complete"
}

# Show deployment banner
show_banner() {
  echo ""
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║           BLUE-GREEN DEPLOYMENT STARTED                    ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""
  echo "  Version: ${VERSION}"
  echo "  Active → Inactive: ${ACTIVE_ENV}:${ACTIVE_PORT} → ${INACTIVE_ENV}:${INACTIVE_PORT}"
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
  echo "  Active Port: ${INACTIVE_PORT}"
  echo "  Version: ${VERSION}"
  echo "  Deployment Time: $(date '+%Y-%m-%d %H:%M:%S')"
  echo ""
  echo "Container Status:"
  docker compose -f "${COMPOSE_FILE}" ps
  echo ""
}

# Main deployment flow
main() {
  # Step 1: Load state
  log "📋 Step 1/11: Loading deployment state..."
  load_state
  echo ""

  show_banner

  # Step 2: Validate Caddy upstream path
  log "🔍 Step 2/11: Validating Caddy upstream path..."
  if ! validate_caddy_upstream_path; then
    error "Caddy upstream path validation failed"
    exit 1
  fi
  echo ""

  # Step 3: Pull image from GHCR
  log "📦 Step 3/11: Pulling Docker image from GHCR..."
  pull_image
  echo ""

  # Step 4: Start inactive environment
  log "🚀 Step 4/11: Starting inactive environment..."
  start_inactive_env
  echo ""

  # Step 5: Health check
  log "🏥 Step 5/11: Performing health checks..."
  if ! wait_for_healthy; then
    error "Deployment failed: ${INACTIVE_ENV} is unhealthy"
    echo ""
    error "Logs from ${INACTIVE_ENV}:"
    docker compose -f "${COMPOSE_FILE}" --profile "${INACTIVE_ENV}" logs --tail=50 "backend-${INACTIVE_ENV}"
    echo ""
    log "Cleaning up failed deployment..."
    docker compose -f "${COMPOSE_FILE}" --profile "${INACTIVE_ENV}" down
    exit 1
  fi
  echo ""

  # Step 6: Network validation
  log "🔌 Step 6/11: Validating network connectivity..."
  if ! validate_networks; then
    error "Network validation failed"
    rollback
  fi
  echo ""

  # Step 7: Switch traffic
  log "🔀 Step 7/11: Switching traffic to new environment..."
  if ! switch_traffic; then
    error "Failed to switch traffic"
    rollback
  fi
  echo ""

  # Step 8: Validate deployment
  log "✓ Step 8/11: Validating deployment..."
  if ! validate_deployment; then
    error "Validation failed"
    rollback
  fi
  echo ""

  # Step 9: Cleanup old environment
  log "🧹 Step 9/11: Cleaning up old environment..."
  cleanup_old_env
  echo ""

  # Step 10: Update state (flip active/inactive)
  log "💾 Step 10/11: Updating deployment state..."
  save_state "${INACTIVE_ENV}" "${INACTIVE_PORT}" "${ACTIVE_ENV}" "${ACTIVE_PORT}"
  echo ""

  # Step 11: Cleanup old images
  log "🗑️  Step 11/11: Cleaning up old images..."
  cleanup_old_images
  echo ""

  # Show summary
  show_summary

  success "🎉 Deployment complete!"
}

# Trap errors and handle cleanup
trap 'error "Deployment failed at line $LINENO"' ERR

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
