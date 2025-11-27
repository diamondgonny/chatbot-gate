#!/bin/bash
set -euo pipefail

# MongoDB Restore Script
# Usage: ./scripts/restore-mongodb.sh <backup_file>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

if [ $# -eq 0 ]; then
  echo "Usage: $0 <backup_file>"
  echo "Available backups:"
  ls -1 "${REPO_ROOT}"/backups/mongodb/*.archive 2>/dev/null || echo "  No backups found"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Error: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

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

echo "Restoring MongoDB from: ${BACKUP_FILE}"
read -p "This will overwrite the current database. Continue? (y/N) " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Restore cancelled"
  exit 0
fi

# Run mongorestore inside the container
docker compose -f "${REPO_ROOT}/docker-compose.yml" exec -T mongodb mongorestore \
  --username="${MONGO_INITDB_ROOT_USERNAME}" \
  --password="${MONGO_INITDB_ROOT_PASSWORD}" \
  --authenticationDatabase=admin \
  --archive="/backups/$(basename ${BACKUP_FILE})" \
  --gzip \
  --drop

echo "Restore complete!"
