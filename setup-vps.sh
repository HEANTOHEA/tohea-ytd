#!/usr/bin/env bash
# setup-vps.sh — Automated setup for YouTube Music Downloader on Ubuntu/Debian VPS
set -e

echo "=== [1/4] Checking and Installing Docker & Docker Compose ==="
if ! command -v docker &> /dev/null; then
  echo "Docker not found. Installing Docker..."
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg || \
  curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg

  # Setup repository
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$(. /etc/os-release && echo "$ID") \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo systemctl enable --now docker
else
  echo "✓ Docker is already installed: $(docker --version)"
fi

echo "=== [2/4] Configuring Firewall (Port 3000) ==="
if command -v ufw &> /dev/null; then
  sudo ufw allow 3000/tcp comment 'YouTube Music Downloader' || true
fi

echo "=== [3/4] Building and Starting Container ==="
# Stop existing container if running
sudo docker compose down 2>/dev/null || true

# Build and start in detached mode
sudo docker compose up -d --build

echo "=== [4/4] Verifying Service Health ==="
sleep 4
if curl -sf http://localhost:3000/api/health > /dev/null; then
  echo ""
  echo "============================================================"
  echo "✅ YouTube Music Downloader is running successfully!"
  echo "👉 Access your web app at: http://$(curl -s ifconfig.me || echo 'YOUR_SERVER_IP'):3000"
  echo "============================================================"
else
  echo "Service is starting up... checking container status:"
  sudo docker compose ps
fi
