#!/bin/bash
set -euo pipefail

# Zero-Downtime Rolling Update Deployment Script
# Uses health checks and graceful shutdown for minimal downtime (2-5 seconds)

COMPOSE_FILE="docker-compose.yml"
SERVICE_NAME="backend"
IMAGE_NAME="chatbot-gate-backend"
VERSION="${VERSION:-latest}"

echo "🚀 Starting deployment of ${IMAGE_NAME}:${VERSION}"

# Step 1: Build new image
echo "📦 Building new Docker image..."
docker compose -f "${COMPOSE_FILE}" build "${SERVICE_NAME}"

# Tag the image
docker tag "${IMAGE_NAME}:latest" "${IMAGE_NAME}:${VERSION}"

echo "✅ Image built: ${IMAGE_NAME}:${VERSION}"

# Step 2: Pre-deployment health check
echo "🔍 Checking current service health..."
if ! docker compose -f "${COMPOSE_FILE}" ps "${SERVICE_NAME}" | grep -q "healthy"; then
  echo "⚠️  WARNING: Current service is not healthy!"
  read -p "Continue deployment? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled"
    exit 0
  fi
fi

# Step 3: Start new container (with different name)
echo "🔄 Starting new container..."
NEW_CONTAINER_NAME="${SERVICE_NAME}_new"

# Stop and remove existing new container if it exists
docker stop "${NEW_CONTAINER_NAME}" 2>/dev/null || true
docker rm "${NEW_CONTAINER_NAME}" 2>/dev/null || true

# Run new container with health check
docker compose -f "${COMPOSE_FILE}" run -d \
  --name "${NEW_CONTAINER_NAME}" \
  --service-ports \
  --no-deps \
  "${SERVICE_NAME}"

# Step 4: Wait for new container to be healthy
echo "⏳ Waiting for new container to be healthy..."
MAX_WAIT=60
WAITED=0

while [ $WAITED -lt $MAX_WAIT ]; do
  HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' "${NEW_CONTAINER_NAME}" 2>/dev/null || echo "none")

  if [ "$HEALTH_STATUS" = "healthy" ]; then
    echo "✅ New container is healthy!"
    break
  fi

  sleep 2
  WAITED=$((WAITED + 2))
  echo "   Waited ${WAITED}s... (status: ${HEALTH_STATUS})"
done

if [ $WAITED -ge $MAX_WAIT ]; then
  echo "❌ New container failed to become healthy within ${MAX_WAIT}s"
  echo "Rolling back..."
  docker stop "${NEW_CONTAINER_NAME}"
  docker rm "${NEW_CONTAINER_NAME}"
  exit 1
fi

# Step 5: Graceful shutdown of old container
echo "🛑 Stopping old container..."
OLD_CONTAINER_NAME="chatbot-gate-backend"

# Send SIGTERM and wait for graceful shutdown (max 30s)
docker stop -t 30 "${OLD_CONTAINER_NAME}" || true

# Remove old container
docker rm "${OLD_CONTAINER_NAME}" || true

# Step 6: Rename new container to standard name
echo "🔄 Renaming new container..."
docker rename "${NEW_CONTAINER_NAME}" "${OLD_CONTAINER_NAME}"

# Step 7: Update docker-compose to manage the container
echo "🔄 Updating docker-compose..."
docker compose -f "${COMPOSE_FILE}" up -d "${SERVICE_NAME}"

echo "✅ Deployment complete!"
echo "📊 Current services:"
docker compose -f "${COMPOSE_FILE}" ps
