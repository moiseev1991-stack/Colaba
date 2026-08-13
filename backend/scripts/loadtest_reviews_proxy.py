"""Нагрузочный тест боевого пути парсинга отзывов через MAPS_PROXY_URL.

Прогоняет ПРОДАКШН YandexMapsProvider.fetch_reviews по N реальным компаниям
из БД. Прокси НЕ передаём через env вручную — провайдер сам берёт его из
settings.MAPS_PROXY_URL через get_maps_proxy(). Это и есть проверка боевого
пути «как в celery-таске».

Метрики: сколько компаний, сколько отзывов всего, сколько компаний с 0 нод
(возможная капча/смена разметки), среднее время на компанию.

Запуск на проде (без inline-прокси!):
  docker cp backend/scripts/loadtest_reviews_proxy.py colaba-backend-1:/tmp/
  docker exec -e PYTHONPATH=/app -w /app colaba-backend-1 python /tmp/loadtest_reviews_proxy.py 30
"""

import asyncio
import sys
import time

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.maps import Company, CompanySource
from app.modules.maps.providers.yandex_maps import YandexMapsProvider


async def main() -> None:
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    per_company_limit = 30

    proxy_on = bool(settings.MAPS_PROXY_URL)
    print(f"MAPS_PROXY_URL задан: {proxy_on}")
    if not proxy_on:
        print("ВНИМАНИЕ: прокси не задан — тест пойдёт с прямого IP (ожидаем капчу)")

    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                select(CompanySource.external_id, Company.name)
                .join(Company, Company.id == CompanySource.company_id)
                .where(CompanySource.source == "yandex_maps")
                .limit(n)
            )
        ).all()

        if not rows:
            print("В БД нет компаний с source=yandex_maps")
            return

        provider = YandexMapsProvider(db=db)

        total_reviews = 0
        companies_with_reviews = 0
        companies_zero = 0
        t0 = time.monotonic()

        for idx, (ext_id, name) in enumerate(rows, 1):
            c0 = time.monotonic()
            count = 0
            try:
                async for _rv in provider.fetch_reviews(ext_id, limit=per_company_limit):
                    count += 1
            except Exception as e:
                print(f"  [{idx}/{len(rows)}] {name[:40]:40} id={ext_id} ОШИБКА: {type(e).__name__}: {e}")
                companies_zero += 1
                continue
            dt = time.monotonic() - c0
            total_reviews += count
            if count > 0:
                companies_with_reviews += 1
                flag = "OK"
            else:
                companies_zero += 1
                flag = "0 нод (капча?/нет отзывов)"
            print(f"  [{idx}/{len(rows)}] {name[:40]:40} id={ext_id} → {count:3} отзывов за {dt:4.1f}s  {flag}")

        elapsed = time.monotonic() - t0
        print("\n===== ИТОГ =====")
        print(f"Компаний обработано:      {len(rows)}")
        print(f"С отзывами (>0):          {companies_with_reviews}")
        print(f"С 0 нод (капча/пусто):    {companies_zero}")
        print(f"Всего отзывов собрано:    {total_reviews}")
        print(f"Общее время:              {elapsed:.1f}s ({elapsed/len(rows):.1f}s/компанию)")
        if companies_with_reviews:
            rate = companies_with_reviews / len(rows) * 100
            print(f"Success-rate:             {rate:.0f}%")
            # Экстраполяция на «отзывов в день» при последовательном прогоне
            per_hour = total_reviews / elapsed * 3600 if elapsed else 0
            print(f"Экстраполяция:            ~{per_hour:,.0f} отзывов/час в один поток")


if __name__ == "__main__":
    asyncio.run(main())
