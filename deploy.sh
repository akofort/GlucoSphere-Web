#!/usr/bin/env bash
# Deployt den aktuellen Stand von backend/ und frontend/ nach 192.168.1.110 und baut die
# Docker-Container neu. Login per SSH-Key (falls eingerichtet) oder per Passwort -- bei
# Passwort-Login wird dank ControlMaster nur EINMAL pro Lauf danach gefragt, nicht pro Befehl.
set -euo pipefail

HOST="192.168.1.110"
REMOTE_USER="root"
REMOTE_DIR="/opt/glucosphere-web"
LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOCK="/tmp/glucosphere-deploy-$$.sock"

SSH_OPTS=(-o ControlMaster=auto -o ControlPath="$SOCK" -o ControlPersist=120 -o StrictHostKeyChecking=accept-new)
SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
cleanup() { ssh "${SSH_OPTS[@]}" -O exit "$REMOTE_USER@$HOST" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "==> Verbinde mit $HOST"
ssh "${SSH_OPTS[@]}" "$REMOTE_USER@$HOST" true

echo "==> Lade Backend hoch"
scp -rq "${SSH_OPTS[@]}" \
  "$LOCAL_DIR/backend/app" "$LOCAL_DIR/backend/requirements.txt" "$LOCAL_DIR/backend/Dockerfile" \
  "$REMOTE_USER@$HOST:$REMOTE_DIR/backend/"

echo "==> Lade Frontend hoch"
scp -rq "${SSH_OPTS[@]}" \
  "$LOCAL_DIR/frontend/src" "$LOCAL_DIR/frontend/public" "$LOCAL_DIR/frontend/index.html" \
  "$LOCAL_DIR/frontend/package.json" "$LOCAL_DIR/frontend/package-lock.json" \
  "$LOCAL_DIR/frontend/vite.config.ts" "$LOCAL_DIR/frontend/tsconfig.json" \
  "$LOCAL_DIR/frontend/nginx.conf" "$LOCAL_DIR/frontend/Dockerfile" \
  "$REMOTE_USER@$HOST:$REMOTE_DIR/frontend/"

scp -q "${SSH_OPTS[@]}" "$LOCAL_DIR/docker-compose.yml" "$REMOTE_USER@$HOST:$REMOTE_DIR/"

# Build-Stempel für die About-Seite: der Build-Kontext auf dem Server enthält kein .git, also hier
# ermitteln und als Umgebungsvariablen an docker compose durchreichen (siehe docker-compose.yml).
# Ohne das zeigt /settings/about nur "dev" statt des tatsächlich deployten Commits.
BUILD_SHA="$(git -C "$LOCAL_DIR" rev-parse --short HEAD 2>/dev/null || echo dev)"
if ! git -C "$LOCAL_DIR" diff --quiet HEAD 2>/dev/null; then
  BUILD_SHA="$BUILD_SHA-dirty"
fi
BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "==> Baue und starte Container neu (Build $BUILD_SHA)"
ssh "${SSH_OPTS[@]}" "$REMOTE_USER@$HOST" \
  "cd $REMOTE_DIR && VITE_BUILD_SHA='$BUILD_SHA' VITE_BUILD_TIME='$BUILD_TIME' docker compose up -d --build backend frontend"

echo "==> Health-Check"
ssh "${SSH_OPTS[@]}" "$REMOTE_USER@$HOST" "curl -s http://localhost:8180/api/health"
echo
echo "==> Fertig."
