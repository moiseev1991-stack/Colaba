"""Сервисный слой модуля maps.

Чистая работа с БД и моделями. Никаких HTTP-запросов к провайдерам — это
делают app.modules.maps.providers.* и Celery-задачи в app.modules.maps.tasks.

Публичные функции:
- create_map_search    — создать запись MapSearch, проверить кэш
- check_cache          — есть ли свежий кэш на (niche, city, source)
- save_companies_batch — UPSERT партии CompanyRaw + привязка к поиску
- save_reviews_batch   — дедуп-вставка отзывов с derived sentiment
- update_company_aggregates — пересчёт reviews_*_count + last_review_at
- get_search_results   — список компаний поиска с фильтрами
- publish_progress_event — stub (полная реализация в ШАГе 12, SSE)
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.maps import (
    Company,
    MapSearch,
    MapSearchCache,
    MapSearchResult,
    Review,
)
from app.modules.maps.filters import apply_filters
from app.modules.maps.schemas import CompanyRaw, MapSearchFilter, ReviewRaw
from app.modules.maps.utils import derive_sentiment_from_rating, hash_review_text

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------


async def check_cache(
    db: AsyncSession,
    niche: str,
    city: str,
    source: str,
    ttl_days: int | None = None,
) -> bool:
    """True если для (niche, city, source) есть запись с expires_at > now."""
    _ = ttl_days  # сохраняем сигнатуру; TTL применяется при записи, не при чтении
    now = datetime.now(timezone.utc)
    stmt = select(MapSearchCache.id).where(
        MapSearchCache.niche == niche,
        MapSearchCache.city == city,
        MapSearchCache.source == source,
        MapSearchCache.expires_at > now,
    )
    row = (await db.execute(stmt)).first()
    return row is not None


async def upsert_cache_entry(
    db: AsyncSession,
    niche: str,
    city: str,
    source: str,
    companies_count: int,
    reviews_count: int,
    ttl_days: int | None = None,
) -> None:
    """Кладёт/обновляет запись кэша. TTL по умолчанию из settings.MAPS_CACHE_TTL_DAYS."""
    ttl = ttl_days if ttl_days is not None else settings.MAPS_CACHE_TTL_DAYS
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=ttl)

    stmt = pg_insert(MapSearchCache).values(
        niche=niche,
        city=city,
        source=source,
        companies_count=companies_count,
        reviews_count=reviews_count,
        parsed_at=now,
        expires_at=expires,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["niche", "city", "source"],
        set_={
            "companies_count": stmt.excluded.companies_count,
            "reviews_count": stmt.excluded.reviews_count,
            "parsed_at": stmt.excluded.parsed_at,
            "expires_at": stmt.excluded.expires_at,
        },
    )
    await db.execute(stmt)
    await db.commit()


# ---------------------------------------------------------------------------
# Map search lifecycle
# ---------------------------------------------------------------------------


async def create_map_search(
    db: AsyncSession,
    user_id: int,
    niche: str,
    city: str,
    sources: list[str],
    organization_id: int | None = None,
    filters: MapSearchFilter | None = None,
) -> MapSearch:
    """Создаёт запись MapSearch. Статус начально 'pending' (Celery-задача
    переключит на 'running'/'completed'/'failed').

    Если для всех sources кэш свежий — статус сразу 'from_cache'.
    В обоих случаях возвращается ORM-объект, привязанный к сессии.
    """
    cache_hits = [await check_cache(db, niche=niche, city=city, source=s) for s in sources]
    all_cached = bool(sources) and all(cache_hits)
    status = "from_cache" if all_cached else "pending"

    search = MapSearch(
        user_id=user_id,
        organization_id=organization_id,
        niche=niche,
        city=city,
        sources=",".join(sources),
        status=status,
        filters=filters.model_dump(exclude_none=True) if filters else None,
    )
    db.add(search)
    await db.commit()
    await db.refresh(search)
    return search


# ---------------------------------------------------------------------------
# Companies batch
# ---------------------------------------------------------------------------


def _company_row_from_raw(c: CompanyRaw) -> dict[str, Any]:
    """Маппинг CompanyRaw → dict для INSERT."""
    return {
        "source": c.source,
        "external_id": c.external_id,
        "name": c.name,
        "niche": c.niche,
        "city": c.city,
        "address": c.address,
        "lat": c.lat,
        "lng": c.lng,
        "phone": c.phone,
        "website": c.website,
        "rating": c.rating,
        "reviews_count": c.reviews_count,
        "raw_data": c.raw_data,
    }


async def save_companies_batch(
    db: AsyncSession,
    companies_raw: list[CompanyRaw],
    search_id: int,
    start_position: int = 0,
) -> list[Company]:
    """UPSERT партии CompanyRaw по (source, external_id) и привязка к поиску
    через map_search_results.position.

    start_position — позиция первой компании в текущей партии (для пагинации
    при стриминге; следующая партия должна передать start_position + len(prev_batch)).

    Возвращает свежие ORM Company (уже с id).
    """
    if not companies_raw:
        return []

    saved: list[Company] = []
    for offset, c in enumerate(companies_raw):
        values = _company_row_from_raw(c)
        ins = pg_insert(Company).values(**values)
        # On conflict — обновляем только то, что могло измениться (рейтинг, телефон, и т.п.).
        # external_id+source + name не трогаем.
        ins = ins.on_conflict_do_update(
            index_elements=["source", "external_id"],
            set_={
                "address": ins.excluded.address,
                "lat": ins.excluded.lat,
                "lng": ins.excluded.lng,
                "phone": ins.excluded.phone,
                "website": ins.excluded.website,
                "rating": ins.excluded.rating,
                "reviews_count": ins.excluded.reviews_count,
                "raw_data": ins.excluded.raw_data,
                "updated_at": func.now(),
            },
        ).returning(Company.id)
        result = await db.execute(ins)
        company_id = result.scalar_one()

        # Связь с поиском (на конфликт — обновляем position).
        link = pg_insert(MapSearchResult).values(
            map_search_id=search_id,
            company_id=company_id,
            position=start_position + offset,
        ).on_conflict_do_update(
            index_elements=["map_search_id", "company_id"],
            set_={"position": start_position + offset},
        )
        await db.execute(link)

        # populate_existing=True — иначе при повторном вызове на ту же компанию
        # identity map вернёт старую версию объекта (без свежего rating и т.п.)
        company = await db.get(Company, company_id, populate_existing=True)
        if company is not None:
            saved.append(company)

    await db.commit()
    return saved


# ---------------------------------------------------------------------------
# Reviews batch
# ---------------------------------------------------------------------------


def _review_row_from_raw(r: ReviewRaw, company_id: int) -> dict[str, Any]:
    sentiment, sentiment_score = derive_sentiment_from_rating(r.rating)
    return {
        "company_id": company_id,
        "source": r.source,
        "external_id": r.external_id,
        "author_masked": r.author_masked,
        "rating": r.rating,
        "raw_text": r.raw_text,
        "sentiment": sentiment,
        "sentiment_score": sentiment_score,
        "source_url": r.source_url,
        "posted_at": r.posted_at,
        "has_owner_reply": r.has_owner_reply,
        "text_hash": hash_review_text(r.raw_text),
    }


async def save_reviews_batch(
    db: AsyncSession,
    company_id: int,
    reviews_raw: list[ReviewRaw],
) -> int:
    """Вставляет отзывы с дедупом по (company_id, text_hash). Возвращает количество
    действительно вставленных (без учёта тех, что уже были в БД)."""
    if not reviews_raw:
        return 0

    inserted = 0
    for r in reviews_raw:
        values = _review_row_from_raw(r, company_id)
        if not values["text_hash"]:
            continue
        ins = pg_insert(Review).values(**values)
        ins = ins.on_conflict_do_nothing(index_elements=["company_id", "text_hash"]).returning(Review.id)
        row = (await db.execute(ins)).first()
        if row is not None:
            inserted += 1
    await db.commit()
    return inserted


# ---------------------------------------------------------------------------
# Aggregates
# ---------------------------------------------------------------------------


async def update_company_aggregates(db: AsyncSession, company_id: int) -> None:
    """Пересчитывает companies.reviews_*_count, has_owner_replies, owner_replies_count,
    last_review_at одним UPDATE по подзапросу.

    Sentiment derived from rating уже проставлен в save_reviews_batch — поэтому
    распределение positive/negative/neutral корректно даже без AI-обработки.
    """
    await db.execute(
        text(
            """
            UPDATE companies
            SET
                reviews_count = sub.total,
                reviews_positive_count = sub.positive,
                reviews_negative_count = sub.negative,
                reviews_neutral_count  = sub.neutral,
                owner_replies_count    = sub.owner_replies,
                has_owner_replies      = (sub.owner_replies > 0),
                last_review_at         = sub.last_review_at,
                updated_at             = NOW()
            FROM (
                SELECT
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE sentiment = 'positive')::int AS positive,
                    COUNT(*) FILTER (WHERE sentiment = 'negative')::int AS negative,
                    COUNT(*) FILTER (WHERE sentiment = 'neutral')::int  AS neutral,
                    COUNT(*) FILTER (WHERE has_owner_reply IS TRUE)::int AS owner_replies,
                    MAX(posted_at) AS last_review_at
                FROM reviews
                WHERE company_id = :cid
            ) AS sub
            WHERE companies.id = :cid
            """
        ),
        {"cid": company_id},
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Listing
# ---------------------------------------------------------------------------


async def get_search_results(
    db: AsyncSession,
    search_id: int,
    filters: MapSearchFilter | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Company], int]:
    """Возвращает (компании, total). Сортировка и фильтрация — через filters.apply_filters."""
    flt = filters or MapSearchFilter()

    base_q = (
        select(Company)
        .join(MapSearchResult, MapSearchResult.company_id == Company.id)
        .where(MapSearchResult.map_search_id == search_id)
    )
    base_q = apply_filters(base_q, flt)

    count_q = select(func.count()).select_from(base_q.subquery())
    total = (await db.execute(count_q)).scalar_one() or 0

    page_q = base_q.limit(limit).offset(offset)
    items = list((await db.execute(page_q)).scalars().all())
    return items, int(total)


# ---------------------------------------------------------------------------
# Progress events (SSE) — stub, реальная реализация в ШАГе 12
# ---------------------------------------------------------------------------


async def publish_progress_event(search_id: int, event_type: str, payload: dict[str, Any]) -> None:
    """Заглушка. В ШАГе 12 будет публиковать в Redis pub/sub maps_stream:{search_id}."""
    logger.debug(
        "maps SSE stub: search=%d event=%s payload=%s",
        search_id, event_type, json.dumps(payload, default=str)[:300],
    )
