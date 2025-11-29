#!/bin/bash
set -euo pipefail

#############################################
# Setup Deployment Infrastructure
# Creates required directories with proper ownership
# Initializes deployment state file
#############################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

STATE_FILE=".deployment-state"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log() { echo -e "${BLUE}ℹ️  $1${NC}"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}" >&2; }

# Detect if running with sudo/root
detect_sudo() {
  if [[ $EUID -eq 0 ]]; then
    return 0  # Running as root
  fi

  if command -v sudo &> /dev/null && sudo -n true 2>/dev/null; then
    return 0  # Can use sudo without password
  fi

  return 1  # Not root and no sudo
}

# Show guidance when sudo unavailable
show_sudo_guidance() {
  warning "Running without sudo privileges"
  echo ""
  echo "For production deployments, run with sudo for proper ownership:"
  echo "  ${GREEN}sudo ./scripts/setup-deployment.sh${NC}"
  echo ""
  echo "This ensures container (UID 1001) can write to log directories."
  echo ""
  read -p "Continue without sudo? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    error "Setup cancelled"
    exit 1
  fi
}

# Create directory with proper ownership
create_and_secure_directory() {
  local dir="$1"
  local description="$2"

  if [[ -d "$dir" ]]; then
    log "Directory already exists: $dir"

    # Verify ownership if running as root
    if [[ $EUID -eq 0 ]]; then
      local current_owner
      current_owner=$(stat -c '%u' "$dir" 2>/dev/null || stat -f '%u' "$dir" 2>/dev/null)

      if [[ "$current_owner" != "1001" ]]; then
        warning "Fixing ownership: $dir (was UID $current_owner)"
        chown 1001:1001 "$dir"
        chmod 755 "$dir"
        success "Ownership corrected"
      fi
    fi
    return 0
  fi

  # Create directory
  if ! mkdir -p "$dir"; then
    error "Failed to create directory: $dir"
    return 1
  fi

  # Set ownership if running as root
  if [[ $EUID -eq 0 ]]; then
    if chown 1001:1001 "$dir" && chmod 755 "$dir"; then
      success "Created $description: $dir (1001:1001 755)"
    else
      error "Failed to set ownership for: $dir"
      return 1
    fi
  else
    chmod 755 "$dir"
    warning "Created $description: $dir (current user)"
    warning "  Container (UID 1001) may not have write access"
  fi

  return 0
}

# Main setup function
main() {
  echo ""
  echo -e "${BLUE}==================================${NC}"
  echo -e "${BLUE}  Deployment Infrastructure Setup ${NC}"
  echo -e "${BLUE}==================================${NC}"
  echo ""

  # Step 1: Detect sudo
  log "Step 1/5: Checking permissions..."
  if ! detect_sudo; then
    show_sudo_guidance
  else
    success "Running with sufficient privileges"
  fi
  echo ""

  # Step 2: Create directories
  log "Step 2/5: Creating deployment directories..."

  local failed=0
  # Create parent directories first
  create_and_secure_directory "${REPO_ROOT}/logs" "Logs directory" || failed=1
  create_and_secure_directory "${REPO_ROOT}/backups" "Backups directory" || failed=1

  # Create subdirectories
  create_and_secure_directory "${REPO_ROOT}/logs/blue" "Blue environment logs" || failed=1
  create_and_secure_directory "${REPO_ROOT}/logs/green" "Green environment logs" || failed=1
  create_and_secure_directory "${REPO_ROOT}/backups/mongodb" "MongoDB backup storage" || failed=1

  if [[ $failed -eq 1 ]]; then
    error "Directory creation failed"
    exit 1
  fi
  echo ""

  # Step 3: Initialize deployment state
  log "Step 3/5: Initializing deployment state..."

  if [[ -f "$STATE_FILE" ]]; then
    log "Deployment state file already exists"
  else
    # Create initial state file with blue as active
    cat > "$STATE_FILE" << EOF
ACTIVE_ENV=blue
ACTIVE_PORT=4000
INACTIVE_ENV=green
INACTIVE_PORT=4001
LAST_DEPLOYMENT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
VERSION=main
EOF

    # Set proper permissions
    chmod 644 "$STATE_FILE"
    success "Created deployment state file"
  fi
  echo ""

  # Step 4: Verify setup
  log "Step 4/5: Verifying setup..."
  local all_exist=0

  for dir in "logs" "logs/blue" "logs/green" "backups" "backups/mongodb"; do
    if [[ ! -d "${REPO_ROOT}/$dir" ]]; then
      error "Missing directory: $dir"
      all_exist=1
    fi
  done

  if [[ ! -f "${REPO_ROOT}/.deployment-state" ]]; then
    error "Missing file: .deployment-state"
    all_exist=1
  fi

  if [[ $all_exist -eq 1 ]]; then
    error "Setup verification failed"
    exit 1
  fi

  success "All directories and files created successfully"
  echo ""

  # Step 5: Summary
  echo -e "${GREEN}==================================${NC}"
  echo -e "${GREEN}  Setup Complete!                 ${NC}"
  echo -e "${GREEN}==================================${NC}"
  echo ""
  echo "Directories created:"
  echo "  📁 ./logs/"
  echo "  📁 ./logs/blue"
  echo "  📁 ./logs/green"
  echo "  📁 ./backups/"
  echo "  📁 ./backups/mongodb"
  echo ""
  echo "State file initialized:"
  echo "  📄 ./.deployment-state"
  echo ""
  echo "Next steps:"
  echo "  1. Configure .env file with required secrets"
  echo "  2. Start MongoDB: docker compose up -d mongodb"
  echo "  3. Run deployment: ./scripts/deploy-blue-green.sh"
  echo ""
}

# Run main
main
