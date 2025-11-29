#!/bin/bash
set -euo pipefail

#############################################
# Blue-Green Deployment Script
# Zero-downtime deployment with automatic rollback
#############################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

STATE_FILE="${REPO_ROOT}/.deployment-state"
COMPOSE_FILE="${REPO_ROOT}/docker-compose.yml"
VERSION="${VERSION:?VERSION environment variable is required}"
IMAGE_NAME="chatbot-gate-backend"
GITHUB_REPO="${GITHUB_REPO:-owner/chatbot-gate}"
IMAGE_FULL_NAME="ghcr.io/${GITHUB_REPO}/chatbot-gate-backend"

# Validate VERSION is set and not empty
if [[ -z "${VERSION}" ]]; then
  echo -e "${RED}ERROR: VERSION environment variable is not set${NC}"
  echo -e "${RED}This must be set by the CI/CD pipeline${NC}"
  exit 1
fi
echo -e "${BLUE}Deploying version: ${VERSION}${NC}"

# Configuration
HEALTH_CHECK_MAX_WAIT=90
HEALTH_CHECK_INTERVAL=3
VALIDATION_PERIOD=10
CADDY_ADMIN_API="http://localhost:2019"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Load deployment state
load_state() {
  if [[ ! -f "$STATE_FILE" ]]; then
    error "State file not found: $STATE_FILE"
    error "Run './scripts/init-deployment-state.sh' first"
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
  log "Switching traffic from ${ACTIVE_ENV}:${ACTIVE_PORT} to ${INACTIVE_ENV}:${INACTIVE_PORT}"

  # First, verify Caddy Admin API is accessible
  if ! curl -f -s "${CADDY_ADMIN_API}/config/" > /dev/null 2>&1; then
    error "Caddy Admin API is not accessible at ${CADDY_ADMIN_API}"
    error "Make sure Caddy is running and Admin API is enabled"
    return 1
  fi

  # Update Caddy upstream via Admin API
  # This updates the reverse_proxy upstream to point to the new port
  local response
  response=$(curl -f -X PATCH "${CADDY_ADMIN_API}/config/apps/http/servers/srv0/routes/0/handle/0" \
    -H "Content-Type: application/json" \
    -d "{
      \"upstreams\": [{
        \"dial\": \"localhost:${INACTIVE_PORT}\"
      }]
    }" 2>&1) || {
      error "Failed to update Caddy upstream"
      error "Response: ${response}"
      return 1
    }

  success "Traffic switched to ${INACTIVE_ENV} on port ${INACTIVE_PORT}"
  return 0
}

# Validate new environment
validate_deployment() {
  log "Validating ${INACTIVE_ENV} for ${VALIDATION_PERIOD}s..."

  local checks=0
  local failures=0
  local max_checks=$((VALIDATION_PERIOD / 2))

  while [ $checks -lt $max_checks ]; do
    if ! curl -f -s "http://localhost:${INACTIVE_PORT}/health" > /dev/null; then
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
    error "Too many health check failures during validation: ${failures}"
    return 1
  fi

  success "Validation passed (${checks} checks, ${failures} failures)"
  return 0
}

# Rollback function
rollback() {
  error "🔄 ROLLBACK: Switching back to ${ACTIVE_ENV}:${ACTIVE_PORT}"

  # Switch traffic back to active environment
  log "Reverting Caddy upstream to ${ACTIVE_ENV}..."
  local response
  response=$(curl -f -X PATCH "${CADDY_ADMIN_API}/config/apps/http/servers/srv0/routes/0/handle/0" \
    -H "Content-Type: application/json" \
    -d "{
      \"upstreams\": [{
        \"dial\": \"localhost:${ACTIVE_PORT}\"
      }]
    }" 2>&1) || {
      error "⚠️  CRITICAL: Rollback failed - manual intervention required!"
      error "Manually switch Caddy to port ${ACTIVE_PORT}"
      error "Response: ${response}"
      exit 2
    }

  success "Traffic reverted to ${ACTIVE_ENV}"

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
  show_banner

  # Step 1: Load state
  log "📋 Step 1/9: Loading deployment state..."
  load_state
  echo ""

  # Step 2: Pull image from GHCR
  log "📦 Step 2/9: Pulling Docker image from GHCR..."
  pull_image
  echo ""

  # Step 3: Start inactive environment
  log "🚀 Step 3/9: Starting inactive environment..."
  start_inactive_env
  echo ""

  # Step 4: Health check
  log "🏥 Step 4/9: Performing health checks..."
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

  # Step 5: Switch traffic
  log "🔀 Step 5/9: Switching traffic to new environment..."
  if ! switch_traffic; then
    error "Failed to switch traffic"
    rollback
  fi
  echo ""

  # Step 6: Validate deployment
  log "✓ Step 6/9: Validating deployment..."
  if ! validate_deployment; then
    error "Validation failed"
    rollback
  fi
  echo ""

  # Step 7: Cleanup old environment
  log "🧹 Step 7/9: Cleaning up old environment..."
  cleanup_old_env
  echo ""

  # Step 8: Update state (flip active/inactive)
  log "💾 Step 8/9: Updating deployment state..."
  save_state "${INACTIVE_ENV}" "${INACTIVE_PORT}" "${ACTIVE_ENV}" "${ACTIVE_PORT}"
  echo ""

  # Step 9: Cleanup old images
  log "🗑️  Step 9/9: Cleaning up old images..."
  cleanup_old_images
  echo ""

  # Show summary
  show_summary

  success "🎉 Deployment complete!"
}

# Trap errors and handle cleanup
trap 'error "Deployment failed at line $LINENO"' ERR

# Execute main flow
main "$@"
