"""Phase 1 разблокировки email: ставит enrich_company_contacts (HTTP-краул сайта
→ email/телефоны/мессенджеры) на компании С БОЛЯМИ, у которых есть website, но
нет email. Самые «горячие» (по сумме упоминаний боли) — первыми.

enrich_company_contacts — лёгкая HTTP-задача (не Playwright), очередь maps_enrich.
Просто пушим задачи в redis, воркер разгребает сам (concurrency=2).

Запуск в контейнере:
    docker exec -w /app -e PYTHONPATH=/app colaba-backend-1 python /tmp/enqueue_pain_email_enrich.py

env:
    ENQ_LIMIT — максимум компаний (0 = все, дефолт 0)
"""

from __future__ import annotations

import asyncio
import os

from sqlalchemy import text

from app.core.database import AsyncSessionLocal
from app.queue.celery_app import celery_app

PICK = text(
    """
    WITH pc AS (
      SELECT DISTINCT s.company_id FROM company_pain_scores s
      JOIN pain_tags pt ON pt.id = s.pain_tag_id
       AND pt.status = 'active' AND pt.sentiment = 'negative'
    ),
    em AS (
      SELECT DISTINCT company_id FROM company_contacts
      WHERE type = 'email' AND value <> ''
    )
    SELECT c.id, COALESCE(SUM(s.mention_count), 0) AS m
    FROM pc
    JOIN companies c ON c.id = pc.company_id
    JOIN company_pain_scores s ON s.company_id = c.id
    LEFT JOIN em ON em.company_id = pc.company_id
    WHERE c.website IS NOT NULL AND c.website <> ''
      AND NOT ((jsonb_typeof(c.emails) = 'array' AND jsonb_array_length(c.emails) > 0)
               OR em.company_id IS NOT NULL)
    GROUP BY c.id
    ORDER BY m DESC
    """
)


async def main() -> None:
    limit = int(os.environ.get("ENQ_LIMIT", "0"))
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(PICK)).all()
    ids = [r[0] for r in rows]
    if limit:
        ids = ids[:limit]
    print(f"selected {len(ids)} companies (site, no email, has pains)", flush=True)
    for i, cid in enumerate(ids, 1):
        celery_app.send_task("enrich_company_contacts", args=[cid], queue="maps_enrich")
        if i % 500 == 0:
            print(f"enqueued {i}/{len(ids)}", flush=True)
    print(f"DONE enqueued {len(ids)}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
