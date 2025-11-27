#!/bin/bash
set -euo pipefail

#############################################
# Initialize Deployment State File
# Creates .deployment-state if not exists
#############################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

STATE_FILE=".deployment-state"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

if [[ -f "$STATE_FILE" ]]; then
  echo -e "${YELLOW}ℹ️  Deployment state file already exists${NC}"
  echo "Current state:"
  cat "$STATE_FILE"
  exit 0
fi

# Create initial state file with blue as active
cat > "$STATE_FILE" << EOF
ACTIVE_ENV=blue
ACTIVE_PORT=4000
INACTIVE_ENV=green
INACTIVE_PORT=4001
LAST_DEPLOYMENT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
VERSION=initial
EOF

# Set proper permissions
chmod 644 "$STATE_FILE"

echo -e "${GREEN}✅ Initialized deployment state file${NC}"
echo "Blue environment is set as active (port 4000)"
echo "Green environment is set as inactive (port 4001)"
echo ""
echo "Contents:"
cat "$STATE_FILE"
