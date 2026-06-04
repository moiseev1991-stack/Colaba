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

echo "=== 1/6: docker load из tarball ==="
docker load -i "$TAR"

echo "=== 2/6: recreate frontend контейнера ==="
cd "$COMPOSE_DIR"
# --no-build: при --pull never compose всё равно пытается собрать backend
# (context: ./backend резолвится в /opt/colaba/backend, которого нет —
# исходники в /opt/colaba-src).
# --no-deps: backend на проде запущен под image-tag sha-..., наш
# IMAGE_TAG=latest промахивается по backend-образу. --no-deps говорит
# compose «не трогай зависимости, только сам frontend».
BACKEND_IMAGE="$BACKEND_IMAGE" FRONTEND_IMAGE="$FRONTEND_IMAGE" IMAGE_TAG="$IMAGE_TAG" \
  docker compose -f docker-compose.prod.yml up -d --force-recreate --pull never --no-build --no-deps frontend

echo "=== 3/6: git pull в $SRC_DIR ==="
cd "$SRC_DIR"
# На проде у origin fetch refspec только +refs/heads/main:refs/remotes/origin/main,
# поэтому origin/feat-* не создаётся локально. Идём через FETCH_HEAD.
git fetch origin "$BRANCH"
git reset --hard FETCH_HEAD
git log --oneline -3

echo "=== 4/6: docker cp router.py + удаление heatmap.py ==="
for c in colaba-backend-1 colaba-celery-worker-1 colaba-celery-worker-search-1; do
  echo "  → $c"
  docker cp "$SRC_DIR/backend/app/modules/maps/router.py" "$c:/app/app/modules/maps/router.py"
  docker exec "$c" rm -f /app/app/modules/maps/heatmap.py || true
done

echo "=== 5/6: restart backend + workers ==="
cd "$COMPOSE_DIR"
docker compose -f docker-compose.prod.yml restart backend celery-worker celery-worker-search

echo "=== 6/6: подменить .next в Coolify-managed frontend (spinlid.ru) ==="
# Прод-трафик spinlid.ru обслуживается отдельным контейнером, который Coolify
# auto-deploys из ветки main. Наш colaba-frontend-1 (из этого compose) ловит
# только запросы по IP. Чтобы пользователь сразу увидел изменения на домене,
# копируем .next из нашего свежего контейнера поверх Coolify-managed.
# Хак работает до следующего Coolify-redeploy (push в main / Redeploy в UI),
# после которого Coolify пересоздаст контейнер из main-кода. Окончательное
# решение — мерж feat-ветки в main.
COOLIFY_CONT=$(docker ps --format '{{.Names}}' | grep '^okkkosgk8ckk00g8goc8g4sk-' | head -1 || true)
if [[ -n "$COOLIFY_CONT" ]]; then
  echo "  Coolify контейнер: $COOLIFY_CONT"
  rm -rf /tmp/colaba-next-staging
  mkdir -p /tmp/colaba-next-staging
  docker cp colaba-frontend-1:/frontend/.next /tmp/colaba-next-staging/.next
  docker exec "$COOLIFY_CONT" rm -rf /frontend/.next
  docker cp /tmp/colaba-next-staging/.next "$COOLIFY_CONT:/frontend/.next"
  echo -n "  новый BUILD_ID в Coolify: "
  docker exec "$COOLIFY_CONT" cat /frontend/.next/BUILD_ID
  echo
  docker restart "$COOLIFY_CONT"
  rm -rf /tmp/colaba-next-staging
else
  echo "  Coolify-frontend контейнер не найден — пропускаю (норма если spinlid.ru сейчас идёт через colaba-frontend-1)."
fi

rm -f "$TAR"

echo
echo "ГОТОВО. Проверь https://spinlid.ru/app/leads — переключатель источника должен появиться."
