#!/bin/bash
set -euo pipefail

# Installation script for pure Docker deployment
# Usage: ./install-deployment-files.sh [staging|production]

ENVIRONMENT=${1:-staging}

if [ "$ENVIRONMENT" = "staging" ]; then
    DEPLOY_DIR="/home/user/lab/apps/chatbot-gate-backend-staging"
elif [ "$ENVIRONMENT" = "production" ]; then
    DEPLOY_DIR="/home/user/lab/apps/chatbot-gate-backend"
else
    echo "Error: Invalid environment. Use 'staging' or 'production'"
    exit 1
fi

echo "Installing deployment files to: $DEPLOY_DIR"

# Create directory structure
mkdir -p "$DEPLOY_DIR"/{scripts,logs/{blue,green},backups/mongodb}

# Copy deployment scripts
echo "Copying deployment scripts..."
cp -v scripts/*.sh "$DEPLOY_DIR/scripts/"
chmod +x "$DEPLOY_DIR/scripts/"*.sh

# Copy docker-compose.yml
echo "Copying docker-compose.yml..."
cp -v docker-compose.yml "$DEPLOY_DIR/"

# Create .env.local template if it doesn't exist
if [ ! -f "$DEPLOY_DIR/.env.local" ]; then
    echo "Creating .env.local template..."
    cat > "$DEPLOY_DIR/.env.local" << 'EOF'
# MongoDB Configuration
MONGO_INITDB_ROOT_USERNAME=admin
MONGO_INITDB_ROOT_PASSWORD=CHANGEME
MONGO_INITDB_DATABASE=chatbot_gate

# JWT Configuration
JWT_SECRET=CHANGEME
JWT_EXPIRES_IN=24h

# OpenAI API Key
OPENAI_API_KEY=sk-CHANGEME

# Frontend URLs
FRONTEND_URLS=https://your-domain.com

# Access Codes
VALID_CODES=code1,code2

# Docker Image Configuration (DO NOT MODIFY - Set by CI/CD)
GITHUB_REPO=owner/chatbot-gate
VERSION=latest
EOF
    echo "⚠️  IMPORTANT: Edit $DEPLOY_DIR/.env.local with real values!"
else
    echo "✓ .env.local already exists, skipping..."
fi

# Initialize deployment state
echo "Initializing deployment state..."
cd "$DEPLOY_DIR"
./scripts/init-deployment-state.sh

echo "✅ Installation complete!"
echo ""
echo "Next steps:"
echo "1. Edit $DEPLOY_DIR/.env.local with production values"
echo "2. Ensure Caddy network exists: docker network create caddy_downstream"
echo "3. Start MongoDB: cd $DEPLOY_DIR && docker compose up -d mongodb"
echo "4. Login to GHCR: echo \"\$TOKEN\" | docker login ghcr.io -u USERNAME --password-stdin"
echo "5. Test deployment: ./scripts/deploy-blue-green.sh"
