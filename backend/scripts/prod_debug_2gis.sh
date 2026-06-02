#!/bin/bash
# Прогоняет debug_2gis_html.py на проде «безопасно»:
#   1) Очищает очередь maps_2gis_html (останавливает bulk-таску → освобождает RAM)
#   2) Ждёт 40 сек чтобы in-flight Playwright-таски завершились
#   3) Берёт external_id первой 2gis-fetched компании из БД
#   4) Копирует debug-скрипт в celery-worker-search и запускает его в фоне
#   5) Ждёт 60 сек (рендер страницы Playwright'ом)
#   6) Выводит /tmp/debug.log
#
# Запуск (с локальной машины Димы):
#   ssh -i ~/.ssh/colaba_server root@88.210.53.183 \
#     'cd /opt/colaba-src && git fetch && git reset --hard origin/main && bash backend/scripts/prod_debug_2gis.sh'

set -e

echo "=== [1/6] Очищаю очередь maps_2gis_html ==="
docker exec colaba-redis-1 redis-cli DEL maps_2gis_html

echo "=== [2/6] Жду 40 сек чтобы in-flight Playwright-таски завершились и освободили RAM ==="
sleep 40

echo "=== [3/6] Беру external_id из БД ==="
ext_id=$(docker exec colaba-postgres-1 psql -U leadgen_user -d leadgen_db -tA \
    -c "SELECT external_id FROM companies WHERE source='2gis' AND contacts_extra ? 'fetched_2gis_url' LIMIT 1;")
echo "ext_id=$ext_id"
if [ -z "$ext_id" ]; then
    echo "ERROR: ext_id is empty — нет 2gis-компаний с fetched_2gis_url"
    exit 1
fi

echo "=== [4/6] Копирую debug-скрипт в celery-worker-search и запускаю в фоне ==="
docker exec colaba-celery-worker-search-1 mkdir -p /app/scripts
docker cp /opt/colaba-src/backend/scripts/debug_2gis_html.py \
    colaba-celery-worker-search-1:/app/scripts/debug_2gis_html.py
docker exec colaba-celery-worker-search-1 rm -f /tmp/debug.log
docker exec -d colaba-celery-worker-search-1 sh -c \
    "python /app/scripts/debug_2gis_html.py $ext_id > /tmp/debug.log 2>&1"

echo "=== [5/6] Жду 60 сек пока Playwright рендерит ==="
sleep 60

echo "=== [6/6] Результат /tmp/debug.log: ==="
echo "--------------------------------------------"
docker exec colaba-celery-worker-search-1 cat /tmp/debug.log
echo "--------------------------------------------"
echo "=== DONE ==="
