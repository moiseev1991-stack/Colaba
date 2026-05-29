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

from sqlalchemy import select, text, update

from app.core.database import AsyncSessionLocal
from app.models.maps import Company, MapSearch
from app.modules.maps import service
from app.modules.maps.enrich import fetch_and_extract
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

# 5 вместо 20 — на multi-query expansion с 4 синонимами и дедупом по
# external_id первые 20 уникальных набираются медленно (особенно для региональных
# поисков, где 2GIS отвечает 5-10с на страницу). При 5 компаний flush —
# первые карточки появляются в UI уже через 5-15 секунд после старта.
COMPANIES_BATCH_SIZE = 5
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


async def _parse_companies_for_source(db, search: MapSearch, source: str) -> tuple[int, bool]:
    """Прогоняет provider.search_companies через batch-сейв.
    После каждой партии ставит parse_company_reviews.delay.

    Multi-query expansion: для популярных ниш (см. modules/maps/synonyms.py) гоняет
    несколько поисковых запросов-синонимов с дедупом по external_id. На free-плане
    2GIS отдаёт max 50 компаний на запрос, 4 синонима = до 200 уникальных.

    Возвращает (count, completed):
      - count: сколько компаний реально сохранено и привязано к поиску
        (пропущенный хвост батча при exception не учитывается).
      - completed: True если итератор провайдера дошёл до конца без
        CaptchaWallError/RateLimitError. False означает «парсинг частичный,
        кэш писать нельзя».
    """
    try:
        provider = _build_provider(source, db)
    except MissingAPIKeyError as e:
        logger.warning("parse_map_search source=%s missing api key: %s", source, e)
        return 0, False

    from app.core.config import settings
    from app.modules.maps.synonyms import get_search_queries
    limit = settings.MAPS_MAX_COMPANIES_PER_SEARCH

    queries = get_search_queries(search.niche)
    if not queries:
        return 0, True
    logger.info(
        "parse_map_search source=%s niche=%r expanded to %d queries: %r",
        source, search.niche, len(queries), queries,
    )

    await service.publish_progress_event(
        search.id, "progress",
        {
            "stage": "parsing", "source": source,
            "saved": 0, "expected": limit,
            "queries_total": len(queries), "queries_done": 0,
        },
    )

    seen_external_ids: set[str] = set()
    batch: list[CompanyRaw] = []
    saved_count = 0
    position_cursor = 0
    completed = True
    completed_flag = [True]  # mutable wrapper для замыкания внутри _consume_query

    # Семафор для упорядоченного flush — провайдеры могут давать компании
    # в любом порядке, но save_companies_batch должен идти последовательно,
    # чтобы не было race на position_cursor.
    flush_lock = asyncio.Lock()

    async def flush_batch() -> None:
        """Сохраняет batch, ставит downstream-таски и шлёт SSE-events."""
        nonlocal batch, saved_count, position_cursor
        if not batch:
            return
        async with flush_lock:
            to_save = batch
            batch = []
            saved = await service.save_companies_batch(
                db, to_save, search.id, start_position=position_cursor,
            )
            position_cursor += len(to_save)
            saved_count += len(saved)
            for company in saved:
                await service.publish_progress_event(
                    search.id, "company",
                    {"company_id": company.id, "name": company.name, "position": position_cursor},
                )
                parse_company_reviews.delay(company.id, source)
                _maybe_enrich_contacts(company)

    async def _consume_query(q_idx: int, query: str) -> None:
        """Стримит один синоним, дедупит и кладёт в общий batch."""
        nonlocal batch, saved_count
        try:
            async for company_raw in provider.search_companies(query, search.city, limit=limit):
                if saved_count >= limit:
                    return
                ext_id = company_raw.external_id
                if ext_id in seen_external_ids:
                    continue
                seen_external_ids.add(ext_id)
                # Нормализуем нишу под search.niche (а не текущий синоним).
                company_raw.niche = search.niche
                batch.append(company_raw)
                if len(batch) >= COMPANIES_BATCH_SIZE:
                    await flush_batch()
                    await service.publish_progress_event(
                        search.id, "progress",
                        {
                            "stage": "parsing", "source": source,
                            "saved": saved_count, "expected": limit,
                            "queries_total": len(queries), "queries_done": q_idx,
                        },
                    )
        except CaptchaWallError as e:
            logger.warning("parse_map_search source=%s captcha wall on q=%r: %s", source, query, e)
            completed_flag[0] = False
        except RateLimitError as e:
            logger.warning("parse_map_search source=%s rate-limit on q=%r: %s", source, query, e)
            completed_flag[0] = False
        except RuntimeError as e:
            logger.warning(
                "parse_map_search source=%s runtime error on q=%r: %s — синоним пропущен",
                source, query, e,
            )
        except Exception as e:
            logger.exception("parse_map_search: неожиданная ошибка в синониме %r: %s", query, e)

    # Параллельный multi-query через asyncio.gather. Раньше синонимы шли
    # последовательно — на 4 синонима × 5 страниц × 1.1с rate_limit получалось
    # 25-40 секунд до первой видимой партии. Сейчас все синонимы стартуют
    # одновременно, общее время — как самого медленного (~5-10с).
    await asyncio.gather(
        *(_consume_query(i, q) for i, q in enumerate(queries)),
        return_exceptions=True,
    )
    completed = completed_flag[0]

    # хвост последнего батча
    try:
        await flush_batch()
        await service.publish_progress_event(
            search.id, "progress",
            {
                "stage": "parsing", "source": source,
                "saved": saved_count, "expected": limit,
                "queries_total": len(queries), "queries_done": len(queries),
            },
        )
    except Exception as e:
        logger.warning("parse_map_search source=%s flush tail failed: %s", source, e)

    return saved_count, completed


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
                try:
                    count, completed = await _parse_companies_for_source(db, search, source)
                except RuntimeError as e:
                    # Третий слой защиты: если что-то прорвалось через все catch'и
                    # внутри _parse_companies_for_source (например, новая логическая
                    # ошибка провайдера) — НЕ валим весь поиск, просто считаем что
                    # этот source ничего не дал. Юзер увидит EmptyResult, не failed.
                    logger.warning(
                        "parse_map_search: source=%s бросил RuntimeError на верхнем уровне: %s",
                        source, e,
                    )
                    count, completed = 0, False
                total_found += count
                # Кэш пишем только при полном успехе. Если парсинг прервался
                # (капча, рейтлимит) — лучше не писать кэш, чтобы следующий
                # запрос мог нормально перепарсить.
                if completed and count > 0:
                    await service.upsert_cache_entry(
                        db, search.niche, search.city, source,
                        companies_count=count, reviews_count=0,
                    )

            search.companies_found = total_found
            search.status = "completed"
            search.finished_at = datetime.now(timezone.utc)
            if total_found == 0:
                # Полезный сигнал для UI: успешно завершили, но 0 компаний.
                # Самые частые причины — опечатка в нише, узкий запрос, недоступная
                # категория. Чтобы не оставлять юзера в догадках, пишем подсказку
                # в .error (UI решит — показывать как warning, или как hint).
                search.error = (
                    "По этому запросу 2GIS ничего не вернул. "
                    "Попробуй переформулировать нишу или сменить город."
                )
                search.error_type = "EmptyResult"
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
        except RuntimeError as e:
            # 2GIS reviews/list endpoint недоступен на free-плане (meta.code=404 Method not found).
            # Не валим таск: компания уже сохранена, рейтинг и review_count берутся из items-ответа.
            # Без этой ветки таск ретраился max_retries раз и забивал очередь.
            logger.warning("parse_company_reviews source=%s for company=%d skipped: %s", source, company_id, e)

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
# enrich_company_contacts
# ---------------------------------------------------------------------------


def _maybe_enrich_contacts(company: Company) -> None:
    """Хелпер: ставит enrich_company_contacts.delay, если есть сайт и ещё не
    обогащали. Тихо проглатывает любые ошибки постановки таска."""
    try:
        if company.website and company.contacts_enriched_at is None:
            enrich_company_contacts.delay(company.id)
    except Exception as e:
        logger.warning("_maybe_enrich_contacts: cannot enqueue for #%d: %s", company.id, e)


async def _enrich_company_contacts_async(company_id: int) -> dict:
    async with AsyncSessionLocal() as db:
        company = await db.get(Company, company_id)
        if company is None:
            logger.warning("enrich_company_contacts: Company #%d not found", company_id)
            return {"status": "not_found"}
        if not company.website:
            # Помечаем чтобы не пытались снова, но без emails — нечего обогащать
            await db.execute(
                update(Company)
                .where(Company.id == company_id)
                .values(contacts_enriched_at=datetime.now(timezone.utc))
            )
            await db.commit()
            return {"status": "no_website"}

        result = await fetch_and_extract(company.website)

        extra: dict[str, list[str]] = {}
        if result.phones:
            extra["phones"] = result.phones
        if result.telegrams:
            extra["telegrams"] = result.telegrams
        if result.vks:
            extra["vks"] = result.vks
        if result.whatsapps:
            extra["whatsapps"] = result.whatsapps
        if result.fetched_url:
            extra["fetched_url"] = result.fetched_url
        if result.error:
            extra["error"] = result.error

        await db.execute(
            update(Company)
            .where(Company.id == company_id)
            .values(
                emails=result.emails or None,
                contacts_extra=extra or None,
                contacts_enriched_at=datetime.now(timezone.utc),
            )
        )
        await db.commit()
        return {
            "status": "ok",
            "emails": len(result.emails),
            "phones": len(result.phones),
            "telegrams": len(result.telegrams),
            "vks": len(result.vks),
            "whatsapps": len(result.whatsapps),
            "error": result.error,
        }


@celery_app.task(name="enrich_company_contacts", queue="maps", bind=True, max_retries=1)
def enrich_company_contacts(self, company_id: int):
    """Качает сайт компании и достаёт из HTML email/телефоны/мессенджеры.

    Один retry — на случай флапа сети. Дальше — фиксируем contacts_enriched_at
    с пустым emails, чтобы не дёргать сайт повторно при каждом поиске.
    """
    try:
        return asyncio.run(_enrich_company_contacts_async(company_id))
    except Exception as exc:
        logger.warning("enrich_company_contacts retrying company=%d: %s", company_id, exc)
        raise self.retry(exc=exc, countdown=20, max_retries=1)


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
