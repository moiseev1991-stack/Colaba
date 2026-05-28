"""Одноразовый пересчёт companies.reviews_*_count из таблицы reviews.

Зачем нужен: после обновлений модуля maps (commits ce562b8 / 2f84645) у
части компаний на проде осталась рассинхронизация — в reviews есть строки,
но companies.reviews_count == 0 (parse_company_reviews в прошлом не дошёл до
update_company_aggregates). Скрипт делает то, что должен был сделать тот
вызов: пересчитывает агрегаты по таблице reviews.

Запуск на проде:
    docker compose -f docker-compose.prod.yml exec backend \\
        python scripts/maps_recompute_aggregates.py

Опции:
    --search-id <int>   только компании конкретного MapSearch
    --only-mismatched   только компании с COUNT(reviews) != companies.reviews_count
                        (по умолчанию — все компании, у которых есть отзывы)
    --dry-run           показать, что обновилось бы, без записи
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select, text

from app.core.database import AsyncSessionLocal
from app.modules.maps import service


async def _list_target_company_ids(
    *, search_id: int | None, only_mismatched: bool
) -> list[int]:
    """Возвращает список company_id, для которых нужен пересчёт."""
    async with AsyncSessionLocal() as db:
        if search_id is not None:
            q = text(
                """
                SELECT c.id
                FROM companies c
                JOIN map_search_results msr ON msr.company_id = c.id
                WHERE msr.map_search_id = :sid
                """
            )
            params = {"sid": search_id}
        elif only_mismatched:
            q = text(
                """
                SELECT c.id
                FROM companies c
                JOIN (
                    SELECT company_id, COUNT(*) AS real_total
                    FROM reviews
                    GROUP BY company_id
                ) r ON r.company_id = c.id
                WHERE r.real_total <> COALESCE(c.reviews_count, 0)
                """
            )
            params = {}
        else:
            q = text(
                """
                SELECT DISTINCT c.id
                FROM companies c
                JOIN reviews r ON r.company_id = c.id
                """
            )
            params = {}

        rows = (await db.execute(q, params)).all()
        return [int(r[0]) for r in rows]


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--search-id", type=int, default=None)
    parser.add_argument("--only-mismatched", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    ids = await _list_target_company_ids(
        search_id=args.search_id, only_mismatched=args.only_mismatched
    )
    print(f"target companies: {len(ids)}")
    if args.dry_run or not ids:
        if ids[:10]:
            print(f"sample ids: {ids[:10]}")
        return

    updated = 0
    for cid in ids:
        async with AsyncSessionLocal() as db:
            await service.update_company_aggregates(db, cid)
        updated += 1
        if updated % 50 == 0:
            print(f"  ... {updated}/{len(ids)}")
    print(f"done: aggregates recomputed for {updated} companies")


if __name__ == "__main__":
    asyncio.run(main())
