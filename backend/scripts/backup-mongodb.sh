#!/bin/bash
set -euo pipefail

# MongoDB Backup Script
# Usage: ./scripts/backup-mongodb.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

BACKUP_DIR="${REPO_ROOT}/backups/mongodb"
COMPOSE_FILE="${REPO_ROOT}/docker-compose.yml"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="chatbot_gate_${TIMESTAMP}"

# Load environment variables
if [ -f "${REPO_ROOT}/.env.local" ]; then
  export $(grep -v '^#' "${REPO_ROOT}/.env.local" | xargs)
elif [ -f "${REPO_ROOT}/.env" ]; then
  export $(grep -v '^#' "${REPO_ROOT}/.env" | xargs)
elif [ -f "${REPO_ROOT}/../.env" ]; then
  echo "Warning: Using ../.env (consider moving env files into backend/)"
  export $(grep -v '^#' "${REPO_ROOT}/../.env" | xargs)
else
  echo "Error: No .env.local or .env file found"
  exit 1
fi

# Create backup directory
mkdir -p "${BACKUP_DIR}"

echo "Creating MongoDB backup: ${BACKUP_NAME}"

# Run mongodump inside the container
docker compose -f "${COMPOSE_FILE}" exec -T mongodb mongodump \
  --username="${MONGO_INITDB_ROOT_USERNAME}" \
  --password="${MONGO_INITDB_ROOT_PASSWORD}" \
  --authenticationDatabase=admin \
  --db="${MONGO_INITDB_DATABASE}" \
  --archive="/backups/${BACKUP_NAME}.archive" \
  --gzip

echo "Backup created: ${BACKUP_DIR}/${BACKUP_NAME}.archive"

# Keep only last 7 backups
echo "Cleaning old backups (keeping last 7)..."
ls -t "${BACKUP_DIR}"/*.archive 2>/dev/null | tail -n +8 | xargs -r rm --

echo "Backup complete!"
