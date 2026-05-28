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


async def delete_cache_entry(
    db: AsyncSession,
    niche: str,
    city: str,
    source: str,
) -> None:
    """Удаляет запись кэша для (niche, city, source). Используется когда кэш
    оказался «битым» — есть запись в map_search_cache, но в map_search_results
    прошлого поиска нет реальных компаний (например, после CaptchaWallError
    в середине прошлой партии). Позволяет следующему запросу полноценно перепарсить."""
    from sqlalchemy import delete as sql_delete

    await db.execute(
        sql_delete(MapSearchCache).where(
            MapSearchCache.niche == niche,
            MapSearchCache.city == city,
            MapSearchCache.source == source,
        )
    )
    await db.commit()


async def copy_results_from_previous_search(
    db: AsyncSession,
    niche: str,
    city: str,
    source: str,
    new_search_id: int,
) -> int:
    """Копирует map_search_results из последнего успешного MapSearch с такими же
    (niche, city) и source, входящим в его sources, в новый поиск new_search_id.

    Используется при cache hit: данные уже есть в companies/reviews, но без
    привязки к новому поиску UI покажет 0 результатов. Копирование делается
    одним INSERT ... SELECT, фильтруя companies по source — даже если прошлый
    поиск был мультисурсный, копируем только нужный источник.

    Возвращает количество вставленных связей (0 — значит реальных данных
    в прошлом поиске не было, кэш можно считать битым)."""
    prev_q = (
        select(MapSearch.id)
        .where(
            MapSearch.niche == niche,
            MapSearch.city == city,
            MapSearch.status == "completed",
            MapSearch.sources.ilike(f"%{source}%"),
            MapSearch.id != new_search_id,
        )
        .order_by(MapSearch.finished_at.desc().nullslast(), MapSearch.id.desc())
        .limit(1)
    )
    prev_id = (await db.execute(prev_q)).scalar_one_or_none()
    if prev_id is None:
        return 0

    # INSERT ... SELECT с дедупом — если в новом поиске уже есть запись
    # (теоретически после ретрая), не падаем по PK.
    await db.execute(
        text(
            """
            INSERT INTO map_search_results (map_search_id, company_id, position)
            SELECT :new_id, msr.company_id, msr.position
            FROM map_search_results msr
            JOIN companies c ON c.id = msr.company_id
            WHERE msr.map_search_id = :prev_id
              AND c.source = :source
            ON CONFLICT (map_search_id, company_id) DO NOTHING
            """
        ),
        {"new_id": new_search_id, "prev_id": prev_id, "source": source},
    )
    inserted = (
        await db.execute(
            select(func.count()).select_from(
                select(MapSearchResult)
                .join(Company, Company.id == MapSearchResult.company_id)
                .where(
                    MapSearchResult.map_search_id == new_search_id,
                    Company.source == source,
                )
                .subquery()
            )
        )
    ).scalar_one() or 0
    await db.commit()
    return int(inserted)


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
    """Создаёт запись MapSearch и решает: брать из кэша или ставить парсинг.

    Логика на каждый source:
      1) есть свежая запись map_search_cache → пробуем скопировать
         map_search_results из последнего успешного MapSearch с теми же
         (niche, city) и этим source;
      2) если скопировано >0 — этот source считается «отдан из кэша»;
      3) если скопировано 0 (битый или осиротевший кэш — например, прошлый
         парсинг упал в CaptchaWallError до полной партии) — удаляем
         запись кэша и считаем, что для этого source кэша нет, чтобы
         Celery нормально перепарсил.

    Если все sources успешно отданы из кэша — status='from_cache' и Celery
    не ставится. Если хоть один не из кэша — status='pending', и Celery
    задача парсит только некэшированные источники (см. tasks._parse_map_search_async,
    где внутри ещё раз вызывается check_cache).
    """
    search = MapSearch(
        user_id=user_id,
        organization_id=organization_id,
        niche=niche,
        city=city,
        sources=",".join(sources),
        status="pending",  # переопределим ниже, когда узнаем итог по кэшу
        filters=filters.model_dump(exclude_none=True) if filters else None,
    )
    db.add(search)
    await db.commit()
    await db.refresh(search)

    cached_sources: list[str] = []
    total_copied = 0
    for s in sources:
        if not await check_cache(db, niche=niche, city=city, source=s):
            continue
        copied = await copy_results_from_previous_search(
            db, niche=niche, city=city, source=s, new_search_id=search.id,
        )
        if copied > 0:
            cached_sources.append(s)
            total_copied += copied
        else:
            # Кэш есть, но реальных результатов нет — чистим запись, чтобы
            # следующий парсинг прошёл нормально.
            logger.warning(
                "create_map_search: stale cache for (%s, %s, %s) — no rows to copy, dropping",
                niche, city, s,
            )
            await delete_cache_entry(db, niche=niche, city=city, source=s)

    all_cached = bool(sources) and len(cached_sources) == len(sources)
    search.status = "from_cache" if all_cached else "pending"
    if total_copied:
        search.companies_found = total_copied
    if all_cached:
        search.finished_at = datetime.now(timezone.utc)
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


async def list_search_companies_missing_reviews(
    db: AsyncSession,
    search_id: int,
) -> list[tuple[int, str]]:
    """Возвращает [(company_id, source), …] компаний этого поиска, у которых
    reviews_count == 0.

    Используется при cache hit: если прошлый прогон сохранил карточки, но
    parse_company_reviews для большинства компаний упал/не дошёл (rate-limit
    у 2GIS public widget, упавший Celery после ребута и т.п.) — нужно
    допарсить отзывы, иначе UI показывает «0 отзывов» у всех."""
    q = (
        select(Company.id, Company.source)
        .join(MapSearchResult, MapSearchResult.company_id == Company.id)
        .where(
            MapSearchResult.map_search_id == search_id,
            Company.reviews_count == 0,
        )
    )
    rows = (await db.execute(q)).all()
    return [(int(cid), src) for cid, src in rows]


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
    """Публикует событие в Redis-канал maps_stream:{search_id}. Из SSE-эндпоинта
    клиент получит его. При недоступном Redis — просто молча логируется (не блокирует парсинг).
    """
    from app.core.redis_pubsub import maps_stream_channel, publish_event

    await publish_event(maps_stream_channel(search_id), event_type, payload)
