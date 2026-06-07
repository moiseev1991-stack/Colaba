#!/usr/bin/env bash
# Парсинг 4 демонстрационных кейсов из ТЗ 2026-06-05 «MVP + демо-витрина».
# Запускает 4 поиска на проде через docker exec backend, без необходимости
# в JWT-токене. Поиски идут в общую очередь Celery — ниши маленькие, 5-10 мин
# на каждый.
#
# После выполнения скрипта поиски будут видны в /app/leads/history и
# доступны для экспорта через /api/v1/maps/website-leads/export?search_id=...
#
# Запуск (на проде):
#   ssh root@88.210.53.183 'bash /opt/colaba-src/scripts/parse-demo-cases.sh'
#
# Запуск с локали:
#   ssh -i ~/.ssh/colaba_server root@88.210.53.183 \\
#     'bash /opt/colaba-src/scripts/parse-demo-cases.sh'

set -euo pipefail

BACKEND_CONTAINER="${BACKEND_CONTAINER:-colaba-backend-1}"

# (niche, city, preset_label) — preset_label только для отчёта, реально
# фильтрация делается потом на этапе выдачи (пресеты применяются клиентом).
declare -a CASES=(
  "стоматология|Подольск|Нет сайта"
  "медицинский центр|Балашиха|Низкий рейтинг"
  "автосервис|Мытищи|Хаос в работе"
  "мебельный магазин|Санкт-Петербург|Точки сбыта B2B"
)

echo "=== Запуск парсинга 4 демо-кейсов ==="
echo "Backend контейнер: $BACKEND_CONTAINER"
echo

for entry in "${CASES[@]}"; do
  IFS='|' read -r NICHE CITY PRESET <<< "$entry"
  echo "→ [$PRESET] $NICHE / $CITY"

  # Запуск через Python внутри контейнера. Используем существующий
  # service.start_search — он создаёт MapSearch и кикает Celery-таск
  # parser_2gis + parser_yandex_maps.
  docker exec "$BACKEND_CONTAINER" python -c "
import asyncio
from app.core.database import AsyncSessionLocal
from app.modules.maps import service as maps_service
from app.modules.maps.tasks import parse_map_search

async def main():
    async with AsyncSessionLocal() as db:
        # user_id=1 — первый зарегистрированный (обычно админ). Поменяй
        # если на проде другой.
        search = await maps_service.create_map_search(
            db,
            user_id=1,
            niche='$NICHE',
            city='$CITY',
            sources=['2gis', 'yandex_maps'],
        )
        print(f'  search_id={search.id} status={search.status}')
        # Если из кэша — таск не нужен.
        if search.status != 'from_cache':
            parse_map_search.delay(search.id)
            print(f'  → parse_map_search.delay({search.id}) поставлен в Celery')

asyncio.run(main())
" || echo "  ✗ Ошибка при старте $NICHE / $CITY"
done

echo
echo "=== Готово ==="
echo "Парсинг идёт в фоне. Через 5-15 минут поиски будут в статусе"
echo "completed. Открой /app/leads/history чтобы увидеть."
echo
echo "Excel-выгрузка по конкретному поиску:"
echo "  curl -o demo.xlsx 'https://spinlid.ru/api/v1/maps/website-leads/export?search_id=N&only_website_leads=false' -H 'Cookie: access_token=<твой токен>'"
