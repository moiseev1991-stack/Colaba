"""Celery-задачи модуля maps.

Sync-обёртки над async-кодом провайдеров и сервиса через asyncio.run.

Очереди:
- maps          — parse_map_search (главная оркестрация)
- maps_reviews  — parse_company_reviews (по одной компании)
- maintenance   — purge_review_raw_text (cron)

В docker-compose.yml celery-worker должен слушать эти очереди — см. ШАГ ниже.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select, text

from app.core.database import AsyncSessionLocal
from app.models.maps import Company, MapSearch
from app.modules.maps import service
from app.modules.maps.providers.base import (
    CaptchaWallError,
    MissingAPIKeyError,
    RateLimitError,
)
from app.modules.maps.providers.twogis import TwoGisProvider
from app.modules.maps.providers.yandex_maps import YandexMapsProvider
from app.modules.maps.schemas import CompanyRaw, ReviewRaw
from app.queue.celery_app import celery_app

logger = logging.getLogger(__name__)

PROVIDERS_REGISTRY = {
    "2gis": TwoGisProvider,
    "yandex_maps": YandexMapsProvider,
}

COMPANIES_BATCH_SIZE = 20
REVIEWS_BATCH_SIZE = 20


# ---------------------------------------------------------------------------
# parse_map_search
# ---------------------------------------------------------------------------


def _build_provider(source: str, db):
    """Инстанцирует провайдер. YandexMapsProvider требует db для solver."""
    cls = PROVIDERS_REGISTRY.get(source)
    if cls is None:
        raise ValueError(f"unknown source: {source!r}")
    if source == "yandex_maps":
        return cls(db=db)
    return cls()


async def _parse_companies_for_source(db, search: MapSearch, source: str) -> int:
    """Прогоняет provider.search_companies через batch-сейв.
    После каждой партии ставит parse_company_reviews.delay.
    Возвращает количество найденных компаний."""
    try:
        provider = _build_provider(source, db)
    except MissingAPIKeyError as e:
        logger.warning("parse_map_search source=%s missing api key: %s", source, e)
        return 0

    from app.core.config import settings
    limit = settings.MAPS_MAX_COMPANIES_PER_SEARCH

    batch: list[CompanyRaw] = []
    yielded = 0
    position_cursor = 0
    try:
        async for company_raw in provider.search_companies(search.niche, search.city, limit=limit):
            batch.append(company_raw)
            yielded += 1
            if len(batch) >= COMPANIES_BATCH_SIZE:
                saved = await service.save_companies_batch(db, batch, search.id, start_position=position_cursor)
                position_cursor += len(batch)
                batch = []
                for company in saved:
                    await service.publish_progress_event(
                        search.id, "company",
                        {"company_id": company.id, "name": company.name, "position": position_cursor},
                    )
                    parse_company_reviews.delay(company.id, source)
        if batch:
            saved = await service.save_companies_batch(db, batch, search.id, start_position=position_cursor)
            for company in saved:
                await service.publish_progress_event(
                    search.id, "company",
                    {"company_id": company.id, "name": company.name, "position": position_cursor},
                )
                parse_company_reviews.delay(company.id, source)
    except CaptchaWallError as e:
        logger.warning("parse_map_search source=%s captcha wall: %s", source, e)
        # дальше по другим источникам идём
    except RateLimitError as e:
        logger.warning("parse_map_search source=%s rate-limit: %s", source, e)

    return yielded


async def _parse_map_search_async(search_id: int) -> None:
    async with AsyncSessionLocal() as db:
        search = await db.get(MapSearch, search_id)
        if search is None:
            logger.error("parse_map_search: MapSearch #%d not found", search_id)
            return

        search.status = "running"
        search.started_at = datetime.now(timezone.utc)
        await db.commit()

        total_found = 0
        try:
            sources = [s.strip() for s in (search.sources or "").split(",") if s.strip()]
            for source in sources:
                if await service.check_cache(db, search.niche, search.city, source):
                    logger.info("parse_map_search: cache hit for %s/%s/%s", search.niche, search.city, source)
                    continue
                count = await _parse_companies_for_source(db, search, source)
                total_found += count
                if count > 0:
                    await service.upsert_cache_entry(
                        db, search.niche, search.city, source,
                        companies_count=count, reviews_count=0,
                    )

            search.companies_found = total_found
            search.status = "completed"
            search.finished_at = datetime.now(timezone.utc)
            await db.commit()
            await service.publish_progress_event(
                search.id, "done",
                {"companies_found": total_found, "reviews_found": search.reviews_found},
            )
        except Exception as e:
            logger.exception("parse_map_search: unhandled error")
            search.status = "failed"
            search.error = str(e)[:2000]
            search.error_type = type(e).__name__
            search.finished_at = datetime.now(timezone.utc)
            await db.commit()
            raise


@celery_app.task(name="parse_map_search", queue="maps", bind=True, max_retries=2)
def parse_map_search(self, search_id: int):
    """Главная задача парсинга поиска. См. _parse_map_search_async."""
    try:
        asyncio.run(_parse_map_search_async(search_id))
    except Exception as exc:
        logger.warning("parse_map_search retrying #%d: %s", search_id, exc)
        raise self.retry(exc=exc, countdown=30, max_retries=2)


# ---------------------------------------------------------------------------
# parse_company_reviews
# ---------------------------------------------------------------------------


async def _parse_company_reviews_async(company_id: int, source: str, limit: int) -> int:
    async with AsyncSessionLocal() as db:
        company = await db.get(Company, company_id)
        if company is None:
            logger.warning("parse_company_reviews: Company #%d not found", company_id)
            return 0

        try:
            provider = _build_provider(source, db)
        except MissingAPIKeyError as e:
            logger.warning("parse_company_reviews source=%s missing api key: %s", source, e)
            return 0

        batch: list[ReviewRaw] = []
        total_inserted = 0
        try:
            async for review_raw in provider.fetch_reviews(company.external_id, limit=limit):
                batch.append(review_raw)
                if len(batch) >= REVIEWS_BATCH_SIZE:
                    total_inserted += await service.save_reviews_batch(db, company.id, batch)
                    batch = []
            if batch:
                total_inserted += await service.save_reviews_batch(db, company.id, batch)
        except (CaptchaWallError, RateLimitError) as e:
            logger.warning("parse_company_reviews source=%s for company=%d: %s", source, company_id, e)

        await service.update_company_aggregates(db, company.id)

    # После закрытия сессии — ставим AI-пайплайн (если есть, что обрабатывать).
    # Импорт локальный — иначе circular между maps.tasks и reviews_ai.tasks.
    if total_inserted > 0:
        try:
            from app.modules.reviews_ai.tasks import analyze_reviews_for_company
            analyze_reviews_for_company.delay(company_id)
        except Exception as e:
            logger.warning("parse_company_reviews: не смог поставить analyze_reviews_for_company: %s", e)
    return total_inserted


@celery_app.task(name="parse_company_reviews", queue="maps_reviews", bind=True, max_retries=2)
def parse_company_reviews(self, company_id: int, source: str, limit: int | None = None):
    """Парсит отзывы одной компании. Лимит из settings.MAPS_MAX_REVIEWS_PER_COMPANY."""
    from app.core.config import settings
    eff_limit = limit if limit is not None else settings.MAPS_MAX_REVIEWS_PER_COMPANY
    try:
        return asyncio.run(_parse_company_reviews_async(company_id, source, eff_limit))
    except Exception as exc:
        logger.warning("parse_company_reviews retrying company=%d: %s", company_id, exc)
        raise self.retry(exc=exc, countdown=30, max_retries=2)


# ---------------------------------------------------------------------------
# purge_review_raw_text (cron)
# ---------------------------------------------------------------------------


async def _purge_review_raw_text_async() -> int:
    """UPDATE reviews SET raw_text=NULL, raw_text_purged_at=NOW()
    WHERE created_at < NOW() - INTERVAL '30 days' AND raw_text IS NOT NULL."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text(
                """
                UPDATE reviews
                SET raw_text = NULL,
                    raw_text_purged_at = NOW()
                WHERE created_at < NOW() - INTERVAL '30 days'
                  AND raw_text IS NOT NULL
                """
            )
        )
        await db.commit()
        return result.rowcount or 0


@celery_app.task(name="purge_review_raw_text", queue="maintenance")
def purge_review_raw_text():
    """Cron: ежедневно в 3:30 (см. beat_schedule в celery_app.py)."""
    count = asyncio.run(_purge_review_raw_text_async())
    logger.info("purge_review_raw_text: purged %d rows", count)
    return count
