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
    CompanyContact,
    CompanySource,
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
    *,
    mode: str = "city",
    address: str | None = None,
    point_lat: float | None = None,
    point_lng: float | None = None,
    radius_meters: int | None = None,
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
        mode=mode,
        address=address,
        point_lat=point_lat,
        point_lng=point_lng,
        radius_meters=radius_meters,
    )
    db.add(search)
    await db.commit()
    await db.refresh(search)

    # Радиус-режим не кэшируется (точка уникальна для каждого поиска), сразу pending.
    if mode == "radius":
        return search

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
# Multi-source: счётчики по источникам для шапки выдачи (ТЗ 2026-06-04)
# ---------------------------------------------------------------------------


async def get_source_counts_for_search(
    db: AsyncSession, search_id: int
) -> dict[str, int]:
    """Считает компании поиска по источникам: total / twogis / yandex_maps / both.

    Считается на ПОЛНОЙ выборке поиска (через map_search_results), без учёта
    активного source_filter — чтобы фронт мог показывать счётчики и до/после
    переключения.
    """
    rows = (await db.execute(text(
        """
        WITH ids AS (
            SELECT company_id FROM map_search_results WHERE map_search_id = :sid
        ),
        agg AS (
            SELECT cs.company_id,
                   BOOL_OR(cs.source = '2gis')        AS has_2gis,
                   BOOL_OR(cs.source = 'yandex_maps') AS has_yandex
            FROM company_sources cs
            JOIN ids ON ids.company_id = cs.company_id
            GROUP BY cs.company_id
        )
        SELECT
            (SELECT COUNT(*) FROM ids) AS total,
            COUNT(*) FILTER (WHERE has_2gis)                 AS twogis,
            COUNT(*) FILTER (WHERE has_yandex)               AS yandex_maps,
            COUNT(*) FILTER (WHERE has_2gis AND has_yandex)  AS both
        FROM agg
        """
    ), {"sid": search_id})).mappings().first()
    if not rows:
        return {"total": 0, "twogis": 0, "yandex_maps": 0, "both": 0}
    return {
        "total": int(rows["total"] or 0),
        "twogis": int(rows["twogis"] or 0),
        "yandex_maps": int(rows["yandex_maps"] or 0),
        "both": int(rows["both"] or 0),
    }


# ---------------------------------------------------------------------------
# Multi-source: bulk-загрузка sources_profiles для API (Phase 4)
# ---------------------------------------------------------------------------


async def attach_sources_for_companies(
    db: AsyncSession, company_ids: list[int]
) -> dict[int, list[dict[str, Any]]]:
    """Тянет company_sources + company_contacts для списка company_ids за 2 SQL.

    Возвращает map company_id → list[CompanySourceOut-совместимых dict'ов].
    Используется в endpoint'ах списка компаний и детали для заполнения
    CompanyOut.sources_profiles.
    """
    if not company_ids:
        return {}
    # Все источники
    src_rows = (await db.execute(text(
        """
        SELECT id, company_id, source, external_id, source_url, rating,
               reviews_count, reviews_positive_count, reviews_negative_count,
               reviews_neutral_count, has_owner_replies, owner_replies_count
        FROM company_sources
        WHERE company_id = ANY(:ids)
        ORDER BY company_id, source
        """
    ), {"ids": company_ids})).mappings().all()

    # Все контакты
    contacts_rows = (await db.execute(text(
        """
        SELECT company_source_id, source, type, value, is_primary
        FROM company_contacts
        WHERE company_id = ANY(:ids)
        """
    ), {"ids": company_ids})).mappings().all()

    contacts_by_source_id: dict[int, list[dict[str, Any]]] = {}
    for row in contacts_rows:
        contacts_by_source_id.setdefault(int(row["company_source_id"]), []).append({
            "source": row["source"],
            "type": row["type"],
            "value": row["value"],
            "is_primary": bool(row["is_primary"]),
        })

    out: dict[int, list[dict[str, Any]]] = {}
    for r in src_rows:
        cid = int(r["company_id"])
        out.setdefault(cid, []).append({
            "source": r["source"],
            "external_id": r["external_id"],
            "source_url": r["source_url"],
            "rating": float(r["rating"]) if r["rating"] is not None else None,
            "reviews_count": int(r["reviews_count"] or 0),
            "reviews_positive_count": int(r["reviews_positive_count"] or 0),
            "reviews_negative_count": int(r["reviews_negative_count"] or 0),
            "reviews_neutral_count": int(r["reviews_neutral_count"] or 0),
            "has_owner_replies": bool(r["has_owner_replies"]),
            "owner_replies_count": int(r["owner_replies_count"] or 0),
            "contacts": contacts_by_source_id.get(int(r["id"]), []),
        })
    return out


# ---------------------------------------------------------------------------
# Multi-source sync (Phase 3 ТЗ multi-source 2026-06-03)
# ---------------------------------------------------------------------------


# Карта: ключ contacts_extra → type в company_contacts
_CONTACTS_EXTRA_TYPE_MAP = (
    ("phones", "phone"),
    ("telegrams", "telegram"),
    ("vks", "vk"),
    ("whatsapps", "whatsapp"),
    ("instagrams", "instagram"),
    ("facebooks", "facebook"),
    ("oks", "ok"),
    ("youtubes", "youtube"),
)


async def _sync_company_to_multisource(db: AsyncSession, company: Company) -> None:
    """Зеркалит данные companies.* в company_sources / company_contacts.

    Дёргается из save_companies_batch и enrich-тасков после изменения companies.
    Идемпотентна — повторный вызов на той же company безопасен (ON CONFLICT).

    Phase 3 минимальная: матчинг к existing мульти-компаниям НЕ делается, новая
    company всегда получает свой company_sources с match_confidence=1.00.
    Склейку с другим источником (если найдётся) делает периодический Celery-job
    `cron_dedup_multisource` (запускает скрипт scripts/dedup_multisource_phase2.py).
    """
    # 1. company_sources — UPSERT по (source, external_id)
    src_ins = pg_insert(CompanySource).values(
        company_id=company.id,
        source=company.source,
        external_id=company.external_id,
        rating=company.rating,
        reviews_count=company.reviews_count or 0,
        reviews_positive_count=company.reviews_positive_count or 0,
        reviews_negative_count=company.reviews_negative_count or 0,
        reviews_neutral_count=company.reviews_neutral_count or 0,
        has_owner_replies=company.has_owner_replies or False,
        owner_replies_count=company.owner_replies_count or 0,
        last_review_at=company.last_review_at,
        raw_data=company.raw_data,
        match_confidence=1.00,
        matched_by="parser_sync",
        last_parsed_at=func.now(),
    ).on_conflict_do_update(
        index_elements=["source", "external_id"],
        set_={
            "rating": company.rating,
            "reviews_count": company.reviews_count or 0,
            "reviews_positive_count": company.reviews_positive_count or 0,
            "reviews_negative_count": company.reviews_negative_count or 0,
            "reviews_neutral_count": company.reviews_neutral_count or 0,
            "has_owner_replies": company.has_owner_replies or False,
            "owner_replies_count": company.owner_replies_count or 0,
            "last_review_at": company.last_review_at,
            "raw_data": company.raw_data,
            "last_parsed_at": func.now(),
            "updated_at": func.now(),
        },
    ).returning(CompanySource.id)
    cs_id = (await db.execute(src_ins)).scalar_one()

    # 2. company_contacts — собираем все контакты компании в плоский список
    contacts: list[tuple[str, str, bool]] = []  # (type, value, is_primary)
    if company.phone:
        contacts.append(("phone", company.phone, True))
    if company.website:
        contacts.append(("website", company.website, True))
    for e in (company.emails or []):
        if isinstance(e, str) and e:
            contacts.append(("email", e, False))
    extra = company.contacts_extra or {}
    if isinstance(extra, dict):
        for key, ctype in _CONTACTS_EXTRA_TYPE_MAP:
            for v in (extra.get(key) or []):
                if isinstance(v, str) and v:
                    contacts.append((ctype, v, False))

    # UPSERT каждого. ON CONFLICT DO NOTHING — если такой контакт уже есть.
    # Параллельно — собираем найденный website для пост-апдейта Company.website
    # (см. ниже): на 2GIS Catalog API website часто NULL, Я.Карты его отдаёт
    # отдельным контактом, но из-за этого `companies.website` оставался пустым
    # и фронт показывал «нет сайта» при реально известном домене.
    found_website: str | None = None
    for ctype, value, is_primary in contacts:
        # value лимит 500 — обрезаем чтобы не упереться в столбец
        v = value[:500]
        if ctype == "website" and not found_website:
            found_website = v
        contact_ins = pg_insert(CompanyContact).values(
            company_source_id=cs_id,
            company_id=company.id,
            source=company.source,
            type=ctype,
            value=v,
            is_primary=is_primary,
        ).on_conflict_do_nothing(
            index_elements=["company_source_id", "type", "value"],
        )
        await db.execute(contact_ins)

    # Если у компании website ещё не выставлен (агрегированное поле для
    # фильтров «нет сайта» / website_lead_score), а в текущем источнике он
    # нашёлся — подтягиваем. NULLIF + COALESCE гарантирует что мы НЕ
    # перепишем уже непустой website (другой источник имеет приоритет
    # «первый нашёл»).
    if found_website:
        await db.execute(
            text(
                "UPDATE companies SET website = :w "
                "WHERE id = :id AND (website IS NULL OR website = '')"
            ),
            {"w": found_website, "id": company.id},
        )


# ---------------------------------------------------------------------------
# Companies batch
# ---------------------------------------------------------------------------


def _company_row_from_raw(c: CompanyRaw) -> dict[str, Any]:
    """Маппинг CompanyRaw → dict для INSERT.

    emails/contacts_extra — если провайдер карты сразу отдал (2GIS contact_groups),
    кладём с пометкой contacts_enriched_at=now(), чтобы краулер сайта не
    переписал их пустыми. Если позже краулер найдёт ещё что-то, он сольёт
    в contacts_extra (он upsert-друже).
    """
    has_provider_contacts = bool(c.emails) or bool(c.contacts_extra)
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
        "emails": c.emails or None,
        "contacts_extra": c.contacts_extra or None,
        "contacts_enriched_at": datetime.now(timezone.utc) if has_provider_contacts else None,
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
        # emails/contacts_extra/contacts_enriched_at — COALESCE-merge: новое
        # значение перетирает старое только когда провайдер карты что-то отдал
        # (иначе повторный поиск без contact_groups затёр бы то, что краулер
        # сайта уже накопил).
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
                "emails": func.coalesce(ins.excluded.emails, Company.__table__.c.emails),
                "contacts_extra": func.coalesce(
                    ins.excluded.contacts_extra, Company.__table__.c.contacts_extra
                ),
                "contacts_enriched_at": func.coalesce(
                    ins.excluded.contacts_enriched_at,
                    Company.__table__.c.contacts_enriched_at,
                ),
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
            # Phase 3 multi-source (миграция 028): зеркалим companies.* в новые
            # company_sources / company_contacts таблицы, чтобы новые компании
            # сразу попадали в multi-source структуру без отдельного backfill.
            # Тихо проглатываем ошибки — старые поля companies.* остаются
            # источником истины пока не пройдёт Phase 4 (API).
            try:
                await _sync_company_to_multisource(db, company)
            except Exception:
                logger.exception("multi-source sync failed for company=%d", company.id)

    # Lead temperature (блок 3) + website_lead_score (блок 4). Пересчитываем
    # сразу после upsert — на этом этапе rating/reviews_count/контакты уже
    # актуальные. last_review_at/owner_replies могут уточниться после
    # save_reviews_batch → там вызывается отдельный recompute.
    if saved:
        from app.modules.maps.lead_temperature import (
            recompute_for_companies as recompute_temperature,
        )
        from app.modules.maps.website_lead_score import (
            recompute_for_companies as recompute_website_score,
        )
        ids = [c.id for c in saved]
        try:
            await recompute_temperature(db, ids)
        except Exception:
            logger.exception("lead_temperature recompute failed for batch")
        try:
            await recompute_website_score(db, ids)
        except Exception:
            logger.exception("website_lead_score recompute failed for batch")

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
        # 2026-07-16: текст ответа владельца для owner_reply_dm.py
        "owner_reply_text": getattr(r, "owner_reply_text", None),
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

    # Lead temperature (блок 3) и website_lead_score (блок 4) зависят от
    # last_review_at / reviews_count / has_owner_replies — все только что
    # обновлены. Пересчитываем оба.
    try:
        from app.modules.maps.lead_temperature import recompute_for_company as _rt
        from app.modules.maps.website_lead_score import recompute_for_company as _rw
        await _rt(db, company_id)
        await _rw(db, company_id)
        await db.commit()
    except Exception:
        logger.exception(
            "temperature/website_score recompute failed for company_id=%s after aggregates",
            company_id,
        )


# ---------------------------------------------------------------------------
# Listing
# ---------------------------------------------------------------------------


async def list_search_all_company_ids(
    db: AsyncSession,
    search_id: int,
) -> list[int]:
    """Возвращает [company_id, …] всех компаний этого поиска.

    Используется при from_cache для триггера reviews_ai по всем компаниям
    (даже уже спарсенным), чтобы pain_tags появились и для кешированных
    ниш — старый from_cache-путь запускал analyze только для компаний
    с reviews_count=0.
    """
    q = (
        select(MapSearchResult.company_id)
        .where(MapSearchResult.map_search_id == search_id)
    )
    rows = (await db.execute(q)).scalars().all()
    return [int(cid) for cid in rows]


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
    """Возвращает (компании, total). Сортировка и фильтрация — через filters.apply_filters.

    Дополнительно: «утечка городов» (roadmap 2026-06-02). Если у поиска
    есть city, а у компании в БД city отличается — отбрасываем (Чайка
    в Кунцево не должна попадать в выдачу «Балашиха»). Старые записи
    в БД иногда имеют ошибочный city из-за провайдер-фильтра до фикса.
    """
    flt = filters or MapSearchFilter()

    base_q = (
        select(Company)
        .join(MapSearchResult, MapSearchResult.company_id == Company.id)
        .where(MapSearchResult.map_search_id == search_id)
    )

    # Фильтр утечки городов: для поиска по городу (mode='city') требуем
    # точное совпадение Company.city с MapSearch.city. Старые компании
    # в БД с ошибочным city (Чайка в Кунцево с city='Балашиха') теперь
    # отфильтровываются на выдаче. Для mode='radius' фильтр не нужен —
    # там критерий = радиус, а не city.
    from app.models.maps import MapSearch
    search_obj = await db.get(MapSearch, search_id)
    if search_obj and (getattr(search_obj, "mode", "city") or "city") == "city":
        search_city = (search_obj.city or "").strip().lower()
        if search_city:
            base_q = base_q.where(
                (Company.city.is_(None))
                | (func.lower(func.trim(Company.city)) == search_city)
            )

    base_q = apply_filters(base_q, flt)

    count_q = select(func.count()).select_from(base_q.subquery())
    total = (await db.execute(count_q)).scalar_one() or 0

    page_q = base_q.limit(limit).offset(offset)
    items = list((await db.execute(page_q)).scalars().all())
    return items, int(total)


# ---------------------------------------------------------------------------
# Top pains per company (для карточки + draft-email)
# ---------------------------------------------------------------------------


async def get_top_pains_for_companies(
    db: AsyncSession,
    company_ids: list[int],
    limit_per_company: int = 3,
    priority_pain_tag_ids: list[int] | None = None,
) -> dict[int, list[dict[str, Any]]]:
    """Для каждой компании возвращает топ-N её болей с цитатами.

    Используется и в карточке-выдаче (рядом с тегом — цитата клиента), и в
    drafte письма (передаём LLM «вот реальные жалобы, перифразируй»).

    Реализация: PARTITION BY company_id ORDER BY mention_count DESC, поверх
    JOIN с pain_tags для label/description. Так быстрее чем дергать по
    каждой компании отдельно.

    Фильтр `pt.sentiment = 'negative'` критичен — без него в результат
    попадали положительные теги (как «вежливый персонал»), и карточка
    показывала их в блоке «БОЛИ КЛИЕНТОВ ИЗ ОТЗЫВОВ».

    Если переданы `priority_pain_tag_ids` (юзер выбрал конкретную боль
    в топ-плитке) — она поднимается наверх в порядке вывода, чтобы
    карточка показывала именно ту боль, по которой шёл отбор.
    """
    if not company_ids:
        return {}
    params: dict[str, Any] = {
        "ids": list(company_ids),
        "limit": int(limit_per_company),
    }
    if priority_pain_tag_ids:
        params["priority_ids"] = list(priority_pain_tag_ids)
        priority_order_sql = (
            "CASE WHEN cps.pain_tag_id = ANY(:priority_ids) THEN 0 ELSE 1 END, "
        )
    else:
        priority_order_sql = ""

    sql = text(
        f"""
        SELECT company_id, pain_tag_id, label, description, mention_count,
               top_quote, top_quote_similarity
        FROM (
            SELECT
                cps.company_id,
                cps.pain_tag_id,
                pt.label,
                pt.description,
                cps.mention_count,
                cps.top_quote,
                cps.top_quote_similarity,
                ROW_NUMBER() OVER (
                    PARTITION BY cps.company_id
                    ORDER BY
                        {priority_order_sql}
                        cps.mention_count DESC,
                        cps.last_mention_at DESC NULLS LAST
                ) AS rn
            FROM company_pain_scores cps
            JOIN pain_tags pt
              ON pt.id = cps.pain_tag_id
             AND pt.status = 'active'
             AND pt.sentiment = 'negative'
            WHERE cps.company_id = ANY(:ids)
        ) ranked
        WHERE rn <= :limit
        """
    )
    rows = list(
        (await db.execute(sql, params)).mappings().all()
    )
    by_company: dict[int, list[dict[str, Any]]] = {}
    for r in rows:
        by_company.setdefault(int(r["company_id"]), []).append({
            "pain_tag_id": int(r["pain_tag_id"]),
            "label": r["label"],
            "description": r["description"],
            "mention_count": int(r["mention_count"] or 0),
            "top_quote": r["top_quote"],
            "top_quote_similarity": float(r["top_quote_similarity"]) if r["top_quote_similarity"] is not None else None,
        })
    return by_company


async def get_negative_snippets_for_companies(
    db: AsyncSession,
    company_ids: list[int],
    limit_per_company: int = 2,
    max_len: int = 180,
) -> dict[int, list[str]]:
    """Fallback-цитаты для карточки: если AI ещё не разобрал боли —
    показываем «голые» куски негативных отзывов, чтобы юзер сразу увидел,
    о чём негатив (Рефлекс: 36 отзывов / 8 негатив, но top_pains пуст —
    карточка раньше показывала нолики; теперь покажет 1-2 фразы из 1★/2★/3★).

    Берём отзывы с rating<=3 ИЛИ sentiment='negative' (одно из условий —
    т.к. sentiment у нас заполняется AI и тоже может быть пустым на свежей
    компании). raw_text обрезается до max_len символов.
    """
    if not company_ids:
        return {}
    sql = text(
        """
        SELECT company_id, raw_text
        FROM (
            SELECT
                r.company_id,
                r.raw_text,
                ROW_NUMBER() OVER (
                    PARTITION BY r.company_id
                    ORDER BY
                        COALESCE(r.rating, 5) ASC,
                        r.posted_at DESC NULLS LAST,
                        r.id DESC
                ) AS rn
            FROM reviews r
            WHERE r.company_id = ANY(:ids)
              AND r.raw_text IS NOT NULL
              AND length(r.raw_text) >= 20
              AND (
                    COALESCE(r.rating, 5) <= 3
                    OR r.sentiment = 'negative'
              )
        ) ranked
        WHERE rn <= :limit
        """
    )
    rows = list(
        (await db.execute(sql, {"ids": list(company_ids), "limit": int(limit_per_company)})).mappings().all()
    )
    by_company: dict[int, list[str]] = {}
    for r in rows:
        cid = int(r["company_id"])
        txt = (r["raw_text"] or "").strip()
        if not txt:
            continue
        if len(txt) > max_len:
            # Обрезаем на ближайшем пробеле, чтобы не рвать слова.
            cut = txt[:max_len]
            sp = cut.rfind(" ")
            if sp > max_len * 0.6:
                cut = cut[:sp]
            txt = cut.rstrip(",.;:!?-—") + "…"
        by_company.setdefault(cid, []).append(txt)
    return by_company


# ---------------------------------------------------------------------------
# Progress events (SSE) — stub, реальная реализация в ШАГе 12
# ---------------------------------------------------------------------------


async def publish_progress_event(search_id: int, event_type: str, payload: dict[str, Any]) -> None:
    """Публикует событие в Redis-канал maps_stream:{search_id}. Из SSE-эндпоинта
    клиент получит его. При недоступном Redis — просто молча логируется (не блокирует парсинг).
    """
    from app.core.redis_pubsub import maps_stream_channel, publish_event

    await publish_event(maps_stream_channel(search_id), event_type, payload)
