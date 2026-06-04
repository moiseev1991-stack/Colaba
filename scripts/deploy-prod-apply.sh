#!/usr/bin/env bash
# Прод-часть деплоя feat/multi-source-filter. Запускать на VPS внутри SSH.
# Требования:
#  - tarball уже лежит в /tmp/colaba-frontend.tar (скопирован через scp)
#  - /opt/colaba и /opt/colaba-src существуют
#  - контейнеры colaba-backend-1, colaba-celery-worker-1,
#    colaba-celery-worker-search-1 запущены
set -euo pipefail

BRANCH=feat/multi-source-filter
TAR=/tmp/colaba-frontend.tar
COMPOSE_DIR=/opt/colaba
SRC_DIR=/opt/colaba-src
FRONTEND_IMAGE=ghcr.io/moiseev1991-stack/colaba-frontend
BACKEND_IMAGE=ghcr.io/moiseev1991-stack/colaba-backend
IMAGE_TAG=latest

# Предохранитель — если tarball отсутствует, скрипт встанет тут.
[[ -f "$TAR" ]] || { echo "Нет $TAR — сначала залей через scp с локали."; exit 1; }

echo "=== 1/5: docker load из tarball ==="
docker load -i "$TAR"

echo "=== 2/5: recreate frontend контейнера ==="
cd "$COMPOSE_DIR"
BACKEND_IMAGE="$BACKEND_IMAGE" FRONTEND_IMAGE="$FRONTEND_IMAGE" IMAGE_TAG="$IMAGE_TAG" \
  docker compose -f docker-compose.prod.yml up -d --force-recreate --pull never frontend

echo "=== 3/5: git pull в $SRC_DIR ==="
cd "$SRC_DIR"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
git log --oneline -3

echo "=== 4/5: docker cp router.py + удаление heatmap.py ==="
for c in colaba-backend-1 colaba-celery-worker-1 colaba-celery-worker-search-1; do
  echo "  → $c"
  docker cp "$SRC_DIR/backend/app/modules/maps/router.py" "$c:/app/app/modules/maps/router.py"
  docker exec "$c" rm -f /app/app/modules/maps/heatmap.py || true
done

echo "=== 5/5: restart backend + workers ==="
cd "$COMPOSE_DIR"
docker compose -f docker-compose.prod.yml restart backend celery-worker celery-worker-search

rm -f "$TAR"

echo
echo "ГОТОВО. Проверь https://spinlid.ru/app/leads — переключатель источника должен появиться."
