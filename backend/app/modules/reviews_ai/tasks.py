"""Celery-задачи модуля reviews_ai.

Очередь maps_ai. Все sync-обёртки гоняют async через asyncio.run + AsyncSessionLocal.

- analyze_reviews_for_company(company_id) — пайплайн для одной компании, ставится
  из parse_company_reviews после сохранения отзывов
- analyze_reviews_batch(review_ids) — для ручного запуска / переобработки
- recluster_pains_for_niche_task(niche, city) — обёртка над service.recluster_pains_for_niche
- recluster_popular_niches() — cron: top-30 (niche, city) по reviews_count → recluster каждой
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from sqlalchemy import desc, func, select

from app.core.database import AsyncSessionLocal
from app.models.maps import Company, Review
from app.modules.reviews_ai import service
from app.queue.celery_app import celery_app

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# analyze_reviews_for_company
# ---------------------------------------------------------------------------


async def _analyze_reviews_for_company_async(company_id: int) -> dict[str, int]:
    async with AsyncSessionLocal() as db:
        rows = list((await db.execute(
            select(Review.id)
            .where(Review.company_id == company_id, Review.ai_processed_at.is_(None))
        )).scalars().all())
        if not rows:
            return {"sentiment": 0, "embeddings": 0, "matched": 0}
        return await service.process_reviews_pipeline(db, [int(r) for r in rows])


@celery_app.task(name="analyze_reviews_for_company", queue="maps_ai", bind=True, max_retries=2)
def analyze_reviews_for_company(self, company_id: int):
    """Прогоняет необработанные отзывы компании через sentiment/embeddings/match."""
    try:
        stats = asyncio.run(_analyze_reviews_for_company_async(company_id))
        logger.info("analyze_reviews_for_company #%d: %s", company_id, stats)
        return stats
    except Exception as exc:
        logger.warning("analyze_reviews_for_company retrying #%d: %s", company_id, exc)
        raise self.retry(exc=exc, countdown=60, max_retries=2)


# ---------------------------------------------------------------------------
# analyze_reviews_batch (manual / re-processing)
# ---------------------------------------------------------------------------


async def _analyze_reviews_batch_async(review_ids: list[int]) -> dict[str, int]:
    async with AsyncSessionLocal() as db:
        return await service.process_reviews_pipeline(db, review_ids)


@celery_app.task(name="analyze_reviews_batch", queue="maps_ai")
def analyze_reviews_batch(review_ids: list[int]):
    if not review_ids:
        return {"sentiment": 0, "embeddings": 0, "matched": 0}
    return asyncio.run(_analyze_reviews_batch_async(review_ids))


# ---------------------------------------------------------------------------
# recluster
# ---------------------------------------------------------------------------


async def _recluster_async(niche: str, city: Optional[str]) -> int:
    async with AsyncSessionLocal() as db:
        return await service.recluster_pains_for_niche(db, niche, city)


@celery_app.task(name="recluster_pains_for_niche_task", queue="maps_ai", bind=True, time_limit=900)
def recluster_pains_for_niche_task(self, niche: str, city: Optional[str] = None):
    """Обёртка над service.recluster_pains_for_niche. time_limit 15 мин (LLM-naming N кластеров может быть медленным)."""
    try:
        return asyncio.run(_recluster_async(niche, city))
    except Exception as exc:
        logger.warning("recluster_pains_for_niche_task retrying %r/%r: %s", niche, city, exc)
        raise self.retry(exc=exc, countdown=300, max_retries=1)


async def _top_niches_by_reviews_async(top_n: int = 30) -> list[tuple[str, str]]:
    """Возвращает топ-N (niche, city) комбинаций по количеству отзывов."""
    async with AsyncSessionLocal() as db:
        q = (
            select(Company.niche, Company.city, func.count(Review.id).label("reviews_n"))
            .join(Review, Review.company_id == Company.id)
            .where(Company.niche.isnot(None), Company.city.isnot(None))
            .group_by(Company.niche, Company.city)
            .order_by(desc("reviews_n"))
            .limit(top_n)
        )
        rows = list((await db.execute(q)).all())
        return [(str(r[0]), str(r[1])) for r in rows]


@celery_app.task(name="recluster_popular_niches", queue="maps_ai")
def recluster_popular_niches():
    """Cron: раз в сутки. Для top-30 (niche, city) комбинаций ставит
    recluster_pains_for_niche_task в очередь."""
    pairs = asyncio.run(_top_niches_by_reviews_async(30))
    for niche, city in pairs:
        recluster_pains_for_niche_task.delay(niche, city)
    return len(pairs)
