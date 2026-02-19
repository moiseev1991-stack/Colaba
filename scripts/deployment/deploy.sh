#!/usr/bin/env bash
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/opt/colaba}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

if [[ -z "${BACKEND_IMAGE:-}" || -z "${FRONTEND_IMAGE:-}" || -z "${IMAGE_TAG:-}" ]]; then
  echo "Missing BACKEND_IMAGE/FRONTEND_IMAGE/IMAGE_TAG environment variables."
  exit 2
fi

cd "$DEPLOY_PATH"

# Загружаем переменные окружения из .env файла, если он существует
if [[ -f "$DEPLOY_PATH/.env" ]]; then
  echo "Loading environment variables from .env file..."
  set -a
  source "$DEPLOY_PATH/.env"
  set +a
fi

if [[ -n "${GHCR_TOKEN:-}" && -n "${GHCR_USER:-}" ]]; then
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null
fi

echo "Bringing up infra (postgres/redis)..."
BACKEND_IMAGE="$BACKEND_IMAGE" FRONTEND_IMAGE="$FRONTEND_IMAGE" IMAGE_TAG="$IMAGE_TAG" \
  docker compose -f "$COMPOSE_FILE" up -d postgres redis

echo "Pulling images..."
BACKEND_IMAGE="$BACKEND_IMAGE" FRONTEND_IMAGE="$FRONTEND_IMAGE" IMAGE_TAG="$IMAGE_TAG" \
  docker compose -f "$COMPOSE_FILE" pull

echo "Running migrations..."
BACKEND_IMAGE="$BACKEND_IMAGE" FRONTEND_IMAGE="$FRONTEND_IMAGE" IMAGE_TAG="$IMAGE_TAG" \
  docker compose -f "$COMPOSE_FILE" run --rm backend alembic upgrade head

echo "Starting services..."
BACKEND_IMAGE="$BACKEND_IMAGE" FRONTEND_IMAGE="$FRONTEND_IMAGE" IMAGE_TAG="$IMAGE_TAG" \
  docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

echo "Waiting for backend health..."
for i in {1..30}; do
  if curl -fsS "http://127.0.0.1:${BACKEND_PORT:-8001}/health" >/dev/null; then
    break
  fi
  sleep 2
done
curl -fsS "http://127.0.0.1:${BACKEND_PORT:-8001}/health" >/dev/null

echo "Waiting for frontend health..."
for i in {1..30}; do
  if curl -fsS "http://127.0.0.1:${FRONTEND_PORT:-3000}/" >/dev/null; then
    break
  fi
  sleep 2
done
curl -fsS "http://127.0.0.1:${FRONTEND_PORT:-3000}/" >/dev/null

echo "Deployment OK."
docker compose -f "$COMPOSE_FILE" ps

