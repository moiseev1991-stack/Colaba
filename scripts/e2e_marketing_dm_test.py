"""E2E-тест Marketing-DM Finder на живых компаниях в проде.

Запускается внутри контейнера backend:
    docker compose -f docker-compose.prod.yml exec -T backend \\
        python /tmp/e2e_marketing_dm_test.py --limit 50

Этапы:
  1) SELECT N компаний из БД с разнообразными нишами (website + city обязательны,
     компании без is_marketing_dm — идёмпотентно).
  2) Для каждой ставим hh + vk + orchestrator (с countdown), логируем task_id.
  3) Ждём 2 минуты (все таски + оркестратор с countdown=45s должны отработать).
  4) Собираем статистику: сколько ЛПР найдено, из каких источников, качество.
  5) Печатаем сводку + список edge cases (нашли-но-мусор, не-нашли-хотя-должны).

Работает синхронно с celery — просто триггерит таски и ждёт.
"""

from __future__ import annotations

import argparse
import asyncio
import time
from collections import Counter
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal as async_session_maker
from app.models.company_decision_maker import CompanyDecisionMaker
from app.models.maps import Company
from app.modules.maps.tasks import (
    enrich_company_hh,
    enrich_company_vk,
    enrich_marketing_dm as enrich_marketing_dm_task,
)


async def pick_companies(db: AsyncSession, limit: int) -> list[Company]:
    """Компании с website+name, у которых ещё нет is_marketing_dm.
    Разнообразим по city через ORDER BY random() (postgres)."""
    already = select(CompanyDecisionMaker.company_id).where(
        CompanyDecisionMaker.is_marketing_dm.is_(True)
    )
    stmt = (
        select(Company)
        .where(Company.website.is_not(None))
        .where(Company.name.is_not(None))
        .where(Company.id.not_in(already))
        .order_by(func.random())
        .limit(limit)
    )
    return list((await db.execute(stmt)).scalars().all())


async def collect_dm_stats(db: AsyncSession, company_ids: list[int]) -> dict[str, Any]:
    """Считает статистику по company_decision_makers для набора компаний."""
    if not company_ids:
        return {"total_dms": 0, "companies_with_dm": 0}
    stmt = select(CompanyDecisionMaker).where(
        CompanyDecisionMaker.company_id.in_(company_ids)
    )
    dms = list((await db.execute(stmt)).scalars().all())

    by_company: dict[int, list[CompanyDecisionMaker]] = {}
    for d in dms:
        by_company.setdefault(d.company_id, []).append(d)

    sources = Counter()
    role_categories = Counter()
    contact_types = Counter()
    marketing_dm_sources = Counter()
    with_contact = 0
    for d in dms:
        sources[d.source or "unknown"] += 1
        role_categories[d.role_category or "none"] += 1
        contact_types[d.contact_type or "none"] += 1
        if d.contact_value:
            with_contact += 1
        if d.is_marketing_dm:
            marketing_dm_sources[d.source or "unknown"] += 1

    companies_with_marketing_dm = sum(
        1 for c_id, ds in by_company.items() if any(d.is_marketing_dm for d in ds)
    )

    return {
        "total_dms": len(dms),
        "companies_with_dm": len(by_company),
        "companies_with_marketing_dm": companies_with_marketing_dm,
        "companies_without_dm": len(company_ids) - len(by_company),
        "with_contact": with_contact,
        "sources": dict(sources),
        "role_categories": dict(role_categories),
        "contact_types": dict(contact_types),
        "marketing_dm_by_source": dict(marketing_dm_sources),
    }


async def sample_edge_cases(
    db: AsyncSession, company_ids: list[int], picked: list[Company]
) -> dict[str, list[dict]]:
    """Показывает 5 успешных случаев и 5 неудачных для ручной оценки качества."""
    stmt = select(CompanyDecisionMaker).where(
        CompanyDecisionMaker.company_id.in_(company_ids)
    )
    all_dms = list((await db.execute(stmt)).scalars().all())
    by_company: dict[int, list[CompanyDecisionMaker]] = {}
    for d in all_dms:
        by_company.setdefault(d.company_id, []).append(d)

    picked_by_id = {c.id: c for c in picked}

    successes = []
    failures = []
    for c_id in company_ids:
        c = picked_by_id.get(c_id)
        if not c:
            continue
        dms = by_company.get(c_id, [])
        marketing_dm = next((d for d in dms if d.is_marketing_dm), None)
        row = {
            "company_id": c_id,
            "name": c.name,
            "city": c.city,
            "website": c.website,
        }
        if marketing_dm:
            row["marketing_dm"] = {
                "name": marketing_dm.name,
                "post": marketing_dm.post,
                "source": marketing_dm.source,
                "role_category": marketing_dm.role_category,
                "contact_type": marketing_dm.contact_type,
                "contact_value": marketing_dm.contact_value,
                "confidence": float(marketing_dm.confidence) if marketing_dm.confidence else None,
            }
            if len(successes) < 5:
                successes.append(row)
        else:
            row["dms_found"] = len(dms)
            row["dm_sources"] = [d.source for d in dms]
            if len(failures) < 5:
                failures.append(row)
    return {"successes": successes, "failures": failures}


async def main(limit: int, wait_seconds: int, stats_only_ids: list[int] | None = None):
    print(f"=== E2E Marketing-DM Finder test (limit={limit}, wait={wait_seconds}s, stats_only={bool(stats_only_ids)}) ===")

    async with async_session_maker() as db:
        if stats_only_ids:
            from sqlalchemy import select as _sel
            picked = list((await db.execute(_sel(Company).where(Company.id.in_(stats_only_ids)))).scalars().all())
        else:
            picked = await pick_companies(db, limit)
        print(f"Picked {len(picked)} companies:")
        for c in picked[:10]:
            print(f"  #{c.id} {c.name!r} city={c.city!r} website={c.website!r}")
        if len(picked) > 10:
            print(f"  ...and {len(picked) - 10} more")

        company_ids = [c.id for c in picked]

        # Snapshot до прогона — считаем existing DM records для этих компаний.
        before_stats = await collect_dm_stats(db, company_ids)
        print(f"\n[BEFORE] {before_stats}")

    if stats_only_ids:
        # Пропускаем enqueue + wait, сразу собираем after-stats.
        async with async_session_maker() as db:
            after_stats = await collect_dm_stats(db, company_ids)
            edge = await sample_edge_cases(db, company_ids, picked)
        _print_summary(company_ids, after_stats, edge)
        return

    # Запускаем таски. Не в транзакции — celery-broker вне.
    print("\n=== Enqueueing tasks ===")
    enqueued_hh = 0
    enqueued_vk = 0
    enqueued_orch = 0
    for c in picked:
        try:
            enrich_company_hh.delay(c.id)
            enqueued_hh += 1
        except Exception as e:
            print(f"  hh delay failed for #{c.id}: {e}")
        try:
            enrich_company_vk.delay(c.id)
            enqueued_vk += 1
        except Exception as e:
            print(f"  vk delay failed for #{c.id}: {e}")
        try:
            enrich_marketing_dm_task.apply_async(args=[c.id], countdown=45)
            enqueued_orch += 1
        except Exception as e:
            print(f"  orch delay failed for #{c.id}: {e}")
    print(f"Enqueued: hh={enqueued_hh} vk={enqueued_vk} orch={enqueued_orch}")

    print(f"\n=== Waiting {wait_seconds}s for tasks to finish ===")
    time.sleep(wait_seconds)

    # Собираем результаты.
    async with async_session_maker() as db:
        after_stats = await collect_dm_stats(db, company_ids)
        edge = await sample_edge_cases(db, company_ids, picked)

    _print_summary(company_ids, after_stats, edge)


def _print_summary(company_ids, after_stats, edge):
    print(f"\n[AFTER] {after_stats}")
    print(f"\n=== 5 SUCCESSES (marketing-DM found) ===")
    for r in edge["successes"]:
        print(r)
    print(f"\n=== 5 FAILURES (no marketing-DM) ===")
    for r in edge["failures"]:
        print(r)

    # Финальная сводка.
    total = len(company_ids)
    found = after_stats.get("companies_with_marketing_dm", 0)
    pct = (found / total * 100) if total else 0
    print(f"\n=== SUMMARY ===")
    print(f"Companies:              {total}")
    print(f"With marketing-DM:      {found} ({pct:.1f}%)")
    print(f"Without any DM:         {after_stats.get('companies_without_dm', 0)}")
    print(f"Total DMs created:      {after_stats.get('total_dms', 0)}")
    print(f"DMs with contact:       {after_stats.get('with_contact', 0)}")
    print(f"DM sources:             {after_stats.get('sources')}")
    print(f"Marketing-DM sources:   {after_stats.get('marketing_dm_by_source')}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--wait", type=int, default=120,
                        help="Seconds to wait after enqueue (default 120)")
    parser.add_argument("--stats-only-ids", type=str, default="",
                        help="Comma-separated company IDs — skip enqueue, just print stats")
    args = parser.parse_args()
    ids = [int(x) for x in args.stats_only_ids.split(",") if x.strip()] if args.stats_only_ids else None
    asyncio.run(main(args.limit, args.wait, ids))
