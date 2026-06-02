#!/bin/bash
# Откатывает слой 5 на проде + чистит ложные website в БД.
#
# Запуск с локальной машины ОДНОЙ командой:
#   ssh -i ~/.ssh/colaba_server root@88.210.53.183 \
#     'cd /opt/colaba-src && git fetch && git reset --hard origin/main && bash backend/scripts/prod_revert_layer5.sh'

set -e

echo "=== [1/4] Стопаю bulk: очищаю очередь maps_2gis_html ==="
docker exec colaba-redis-1 redis-cli DEL maps_2gis_html || true

echo ""
echo "=== [2/4] Чищу в БД ложные website='https://otello.ru/' для 2gis ==="
docker exec colaba-postgres-1 psql -U leadgen_user -d leadgen_db -c \
    "UPDATE companies SET website=NULL WHERE source='2gis' AND website='https://otello.ru/';"

echo ""
echo "=== [3/4] Деплою откатанный enrich_2gis.py (слой 5 закомментирован) ==="
for c in colaba-backend-1 colaba-celery-worker-1 colaba-celery-worker-search-1; do
    docker cp /opt/colaba-src/backend/app/modules/maps/enrich_2gis.py "$c:/app/app/modules/maps/enrich_2gis.py"
done
docker compose -f /opt/colaba/docker-compose.prod.yml restart backend celery-worker celery-worker-search

echo ""
echo "=== [4/4] Финальная стата 2gis-компаний по website ==="
docker exec colaba-postgres-1 psql -U leadgen_user -d leadgen_db -c "
SELECT
  COUNT(*) FILTER (WHERE website IS NOT NULL) AS with_website,
  COUNT(*) FILTER (WHERE website IS NULL AND contacts_extra ? 'fetched_2gis_url') AS fetched_no_site,
  COUNT(*) FILTER (WHERE website IS NULL AND NOT (contacts_extra ? 'fetched_2gis_url')) AS pending
FROM companies WHERE source='2gis';
"

echo ""
echo "=== DONE — слой 5 откачен, БД почищена, парсер вернулся к старому поведению ==="
