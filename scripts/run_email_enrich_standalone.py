"""Автономный сбор EMAIL по компаниям с болями (в обход забитой очереди maps_enrich,
где ~283k легаси-задач). Крутит merge-safe _enrich_company_contacts_async напрямую,
своим event loop'ом, с ограниченной параллельностью.

Берёт компании: есть боли (active/negative), есть website, НЕТ email. Самые горячие
(по сумме упоминаний боли) — первыми.

Запуск (в контейнере, detached):
    docker exec -d -w /app -e PYTHONPATH=/app colaba-celery-worker-search-1 \
        python /tmp/run_email_enrich_standalone.py

env:
    EMAIL_MAX   — максимум компаний (0 = все, дефолт 0)
    EMAIL_CONC  — параллельность HTTP-краула (дефолт 6)
    EMAIL_TAG   — метка в логах
"""

from __future__ import annotations

import asyncio
import os
import time

from sqlalchemy import text

from app.core.database import AsyncSessionLocal
from app.modules.maps.tasks import _enrich_company_contacts_async

_PICK = text(
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
    max_total = int(os.environ.get("EMAIL_MAX", "0"))
    conc = int(os.environ.get("EMAIL_CONC", "6"))
    tag = os.environ.get("EMAIL_TAG", "m")

    async with AsyncSessionLocal() as db:
        rows = (await db.execute(_PICK)).all()
    ids = [r[0] for r in rows]
    if max_total:
        ids = ids[:max_total]
    total = len(ids)
    print(f"[{tag}] picked {total} companies (site, no email) conc={conc}", flush=True)

    sem = asyncio.Semaphore(conc)
    done = emails_found = errors = 0
    t0 = time.time()
    lock = asyncio.Lock()

    async def worker(cid: int) -> None:
        nonlocal done, emails_found, errors
        async with sem:
            try:
                r = await _enrich_company_contacts_async(cid)
                got = int(r.get("emails", 0) or 0)
            except Exception as e:  # noqa: BLE001
                async with lock:
                    errors += 1
                if errors <= 20:
                    print(f"[{tag}] err #{cid}: {e!r}", flush=True)
                return
        async with lock:
            done += 1
            if got:
                emails_found += 1
            if done % 200 == 0:
                rate = done / max(time.time() - t0, 1) * 3600
                print(
                    f"[{tag}] {done}/{total} | email+={emails_found} err={errors} "
                    f"| {rate:.0f}/h",
                    flush=True,
                )

    await asyncio.gather(*(worker(cid) for cid in ids))
    print(
        f"[{tag}] FINISH done={done}/{total} emails_found={emails_found} "
        f"errors={errors} in {(time.time()-t0)/60:.1f}min",
        flush=True,
    )


if __name__ == "__main__":
    asyncio.run(main())
