#!/usr/bin/env bash
# Reanimation script for VPS spinlid (88.210.53.183) after OOM-killer event.
#
# Симптом: Docker-стек целиком лежит после того как `docker build frontend`
# на VPS с 3.8GB RAM съел всю память. Coolify-панель тоже падает, потому что
# она работает в Docker и OOM-killer её тоже прибил. Машина при этом жива
# (ping проходит, SSH работает), но HTTP на 80/443/8000 — таймауты.
#
# Что делает скрипт:
#   1. Убивает зависшие docker build процессы и связанные npm/node, которые
#      могут всё ещё держать RAM.
#   2. Удаляет «exited» контейнеры (они освобождают имена и метаданные).
#   3. Поднимает все сервисы Colaba (backend, frontend, celery, postgres, redis)
#      на тех образах, что уже скачаны локально на VPS — без билда, без pull.
#   4. Ждёт healthcheck postgres/redis, потом перезапускает backend (если он
#      успел стартануть до зависимостей).
#
# НИЧЕГО НЕ УДАЛЯЕТ безвозвратно: не трогает том postgres_data, не трогает
# образы, не трогает /opt/colaba/.env.
#
# Запуск:
#   ssh root@88.210.53.183 'bash -s' < scripts/deployment/recover-after-oom.sh
# или прямо на сервере:
#   curl -fsSL https://raw.githubusercontent.com/moiseev1991-stack/Colaba/main/scripts/deployment/recover-after-oom.sh | bash
# или просто скопировать его в /opt/colaba/ и запустить:
#   bash /opt/colaba/recover-after-oom.sh

set -euo pipefail

COMPOSE_FILE="/opt/colaba/docker-compose.prod.yml"
ENV_FILE="/opt/colaba/.env"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "ERROR: $COMPOSE_FILE не найден. Это точно тот сервер?" >&2
  exit 1
fi

echo "==> 1/5 Освобождаем RAM (убиваем зависшие npm/node и docker build процессы)"
pkill -9 -f "npm ci"        2>/dev/null || true
pkill -9 -f "next build"    2>/dev/null || true
pkill -9 -f "next-server"   2>/dev/null || true
pkill -9 -f "node /frontend" 2>/dev/null || true
# docker build процессы (если есть)
pgrep -f "docker.build" | xargs -r kill -9 2>/dev/null || true

echo "==> 2/5 Удаляем уже умершие (Exited) контейнеры"
docker ps -aq --filter status=exited | xargs -r docker rm 2>/dev/null || true
docker container prune -f >/dev/null

echo "==> 3/5 Память сейчас:"
free -m | head -2

echo "==> 4/5 Поднимаем сервисы из $COMPOSE_FILE (без билда, без pull)"
# Используем уже скачанные на сервере образы — не пытаемся пересобрать или
# перетянуть, потому что именно это нас и положило.
cd /opt/colaba

# Image-теги для compose (если их нет в shell — берём из последнего успешного
# deploy: BACKEND/FRONTEND_IMAGE из GHCR, IMAGE_TAG=latest). Можно
# переопределить, экспортнув эти переменные перед запуском скрипта.
export BACKEND_IMAGE="${BACKEND_IMAGE:-ghcr.io/moiseev1991-stack/colaba-backend}"
export FRONTEND_IMAGE="${FRONTEND_IMAGE:-ghcr.io/moiseev1991-stack/colaba-frontend}"
export IMAGE_TAG="${IMAGE_TAG:-latest}"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-build --pull never

echo "==> 5/5 Проверка через 20 сек"
sleep 20
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"

echo
echo "==> Smoke-тест извне (если backend жив, эти эндпоинты ответят 200):"
curl -s -o /dev/null -w "  https://spinlid.ru/                       : %{http_code}\n" --max-time 10 https://spinlid.ru/ || true
curl -s -o /dev/null -w "  https://spinlid.ru/api/v1/maps/cities      : %{http_code}\n" --max-time 10 https://spinlid.ru/api/v1/maps/cities || true
curl -s -o /dev/null -w "  https://spinlid.ru/api/v1/maps/health/providers : %{http_code}\n" --max-time 10 https://spinlid.ru/api/v1/maps/health/providers || true

echo
echo "Готово. Если HTTP-коды 200 — прод вернулся."
echo "Если 502/504 — backend ещё стартует, подожди минуту и проверь снова:"
echo "  docker compose -f $COMPOSE_FILE logs backend --tail 50"
