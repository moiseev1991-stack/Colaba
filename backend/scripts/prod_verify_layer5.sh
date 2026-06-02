#!/bin/bash
# Запускает bulk_enrich_contacts на ограниченной выборке (limit=50),
# ждёт пока 5-10 первых компаний обработаются новым кодом (слой 5),
# показывает статистику + примеры компаний с найденным website.
#
# Запуск (с локальной машины) в фоне на проде:
#   ssh ... 'nohup bash /opt/colaba-src/backend/scripts/prod_verify_layer5.sh \
#       > /tmp/verify.log 2>&1 & echo started; exit'
#
# Чтение результата через ~3 минуты:
#   ssh ... 'cat /tmp/verify.log'

set -e

LIMIT=${1:-50}

echo "=== [1/4] Сбрасываю fetched_2gis_url у 2gis-компаний без website ==="
docker exec colaba-postgres-1 psql -U leadgen_user -d leadgen_db -c \
    "UPDATE companies SET contacts_extra = contacts_extra - 'fetched_2gis_url' WHERE source='2gis' AND website IS NULL AND contacts_extra ? 'fetched_2gis_url';"

echo ""
echo "=== [2/4] Запускаю bulk_enrich_contacts с limit=$LIMIT ==="
docker compose -f /opt/colaba/docker-compose.prod.yml exec -T backend python -c "
from app.queue.celery_app import celery_app
r = celery_app.send_task('bulk_enrich_contacts', kwargs={'source_filter': '2gis', 'missing_phone': False, 'limit': $LIMIT})
print('task_id:', r.id)
"

echo ""
echo "=== [3/4] Жду 180 сек пока 5-10 задач закроются (по ~30-35 сек/штука, concurrency=2) ==="
sleep 180

echo ""
echo "=== [4/4] Стата 2gis-компаний по website ==="
docker exec colaba-postgres-1 psql -U leadgen_user -d leadgen_db -c "
SELECT
  COUNT(*) FILTER (WHERE website IS NOT NULL) AS with_website,
  COUNT(*) FILTER (WHERE website IS NULL AND contacts_extra ? 'fetched_2gis_url') AS fetched_no_site,
  COUNT(*) FILTER (WHERE website IS NULL AND NOT (contacts_extra ? 'fetched_2gis_url')) AS pending
FROM companies WHERE source='2gis';
"

echo ""
echo "=== Примеры свежих компаний с website (последние 10 обработанных) ==="
docker exec colaba-postgres-1 psql -U leadgen_user -d leadgen_db -c "
SELECT external_id, LEFT(name, 50) AS name, website
FROM companies
WHERE source='2gis' AND website IS NOT NULL AND contacts_extra ? 'fetched_2gis_url'
ORDER BY updated_at DESC NULLS LAST
LIMIT 10;
"

echo ""
echo "=== Свежие enrich-результаты из лога celery-worker-search ==="
docker logs --tail 300 colaba-celery-worker-search-1 2>&1 | grep -E 'succeeded.*enrich_company_from_2gis_html' | tail -10

echo ""
echo "=== DONE ==="
