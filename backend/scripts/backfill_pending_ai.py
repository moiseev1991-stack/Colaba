"""One-shot скрипт: ставит analyze_reviews_for_company для всех компаний
с необработанными отзывами (Review.ai_processed_at IS NULL).

Нужен после подключения reviews_ai к проду — компании, парсившиеся ДО этого,
имеют отзывы но без pain_tags / sentiment / embeddings. Повторный парсинг
не помогает (нет новых отзывов = нет триггера). Скрипт пробегается по БД
и ставит таски в очередь maps_ai разом.

Запуск:
    docker compose -f docker-compose.prod.yml exec backend \\
        python scripts/backfill_pending_ai.py

Таска analyze_reviews_for_company сама проверяет, какие отзывы не обработаны,
и no-op если всё уже обработано — поэтому повторный запуск скрипта безопасен.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Чтобы скрипт работал и из backend/scripts/, и из других точек
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import distinct, select  # noqa: E402

from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.maps import Review  # noqa: E402


async def main() -> int:
    async with AsyncSessionLocal() as db:
        stmt = (
            select(distinct(Review.company_id))
            .where(Review.ai_processed_at.is_(None))
        )
        rows = (await db.execute(stmt)).scalars().all()
        company_ids = [int(c) for c in rows]
        print(f"Найдено компаний с unprocessed reviews: {len(company_ids)}")

    if not company_ids:
        print("Нечего обрабатывать — все отзывы уже прошли AI-пайплайн.")
        return 0

    # Локальный импорт — чтобы не тянуть celery_app пока БД-сессия ещё открыта
    from app.modules.reviews_ai.tasks import analyze_reviews_for_company

    queued = 0
    for cid in company_ids:
        try:
            analyze_reviews_for_company.delay(cid)
            queued += 1
        except Exception as e:
            print(f"  не смог поставить #{cid}: {e}")

    print(f"Поставлено в очередь maps_ai: {queued} / {len(company_ids)} тасок")
    print("Прогресс смотри в логах celery-worker:")
    print("  docker compose -f docker-compose.prod.yml logs -f celery-worker | grep analyze_reviews")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
