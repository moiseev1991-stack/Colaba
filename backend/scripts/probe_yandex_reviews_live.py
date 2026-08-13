"""Боевая проверка: берём реальный yandex-external_id из БД и прогоняем
через ПРОДАКШН-парсер YandexMapsProvider.fetch_reviews, печатаем тексты.

Запуск на проде:
  docker cp backend/scripts/probe_yandex_reviews_live.py colaba-celery-worker-search-1:/tmp/
  docker exec colaba-celery-worker-search-1 python /tmp/probe_yandex_reviews_live.py
"""

import asyncio

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.maps import Company, CompanySource
from app.modules.maps.providers.yandex_maps import YandexMapsProvider


async def main() -> None:
    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                select(CompanySource.external_id, Company.name)
                .join(Company, Company.id == CompanySource.company_id)
                .where(CompanySource.source == "yandex_maps")
                .limit(5)
            )
        ).all()

        if not rows:
            print("В БД нет компаний с source=yandex_maps")
            return

        provider = YandexMapsProvider(db=db)

        for ext_id, name in rows:
            print(f"\n===== Компания: {name} | yandex id={ext_id} =====")
            count = 0
            async for rv in provider.fetch_reviews(ext_id, limit=5):
                count += 1
                text = (rv.raw_text or "").strip().replace("\n", " ")
                if len(text) > 240:
                    text = text[:240] + "…"
                print(f"  [{count}] ⭐{rv.rating} {rv.author_masked or '—'} | {rv.posted_at}")
                print(f"      ТЕКСТ: {text or '(пусто)'}")
                if count >= 5:
                    break
            if count == 0:
                print("  ⚠️ отзывов не распарсено (0 нод) — возможна смена разметки/капча")
            else:
                print(f"  ✅ распарсено текстов: {count}")
            # достаточно первой компании, которая реально отдала тексты
            if count > 0:
                break


if __name__ == "__main__":
    asyncio.run(main())
