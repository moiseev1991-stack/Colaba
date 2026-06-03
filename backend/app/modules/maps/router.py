"""HTTP API модуля maps. Префикс /maps (монтируется в api/v1).

Эндпоинты:
- POST   /maps/search                         — создать поиск + поставить Celery
- GET    /maps/search/{id}                    — состояние поиска
- GET    /maps/search/{id}/companies          — список компаний (с фильтрами)
- GET    /maps/search/{id}/stream             — SSE (заглушка до ШАГа 12)
- GET    /maps/companies/{id}                 — карточка компании + последние отзывы
- GET    /maps/companies/{id}/reviews         — отзывы компании
- GET    /maps/cities                         — список крупных городов (28 для 2GIS)
- GET    /maps/niche-suggestions?q=...        — заглушка автокомплита
- GET    /maps/pain-tags                      — заглушка до ШАГов 7-11 (вернёт [])
- GET    /maps/health/providers               — статус провайдеров

NB: без `from __future__ import annotations` — Pydantic+FastAPI плохо работают
с ForwardRef в аннотациях параметров эндпоинтов (особенно Query/Body Pydantic-моделей).
"""

import csv
import io
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func as sa_func, select
from sqlalchemy.ext.asyncio import AsyncSession


def sqlalchemy_func_sum_mention():
    """Хелпер для повторного использования агрегата SUM(company_pain_scores.mention_count)."""
    from app.models.pain_tag import CompanyPainScore
    return sa_func.sum(CompanyPainScore.mention_count)

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.rate_limit import limiter
from app.models.maps import Company, MapSearch, Review
from app.models.pain_tag import PainTag
from app.modules.maps import service
from app.modules.maps.providers.twogis import CITY_TO_REGION_ID, KNOWN_CITIES_FOR_UI
from app.modules.maps.schemas import (
    CompaniesListOut,
    CompanyDetailOut,
    CompanyDigestOut,
    CompanyLegalOut,
    CompanyOut,
    CompanyPainOut,
    CompanySourceOut,
    MapSearchCreate,
    MapSearchFilter,
    MapSearchOut,
    OutreachDraftCachedOut,
    OutreachDraftOut,
    OutreachDraftRequest,
    PainTagOut,
    ProvidersHealthOut,
    SourceCountsOut,
    ReviewOut,
    ReviewsListOut,
    SortBy,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/maps", tags=["maps"])


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


async def _get_owned_search(db: AsyncSession, search_id: int, user_id: int) -> MapSearch:
    """Возвращает MapSearch с проверкой владения. 404 если не существует, 403 если чужой."""
    search = await db.get(MapSearch, search_id)
    if search is None:
        raise HTTPException(status_code=404, detail="Search not found")
    if search.user_id != user_id:
        # суперюзеру в этой версии не даём смотреть чужие поиски — не критично, ШАГ позже
        raise HTTPException(status_code=403, detail="Access denied")
    return search


async def _get_company_or_404(db: AsyncSession, company_id: int) -> Company:
    company = await db.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


# ---------------------------------------------------------------------------
# Search lifecycle
# ---------------------------------------------------------------------------


@router.post("/search", response_model=MapSearchOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def create_map_search(
    request: Request,
    payload: MapSearchCreate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Создаёт поиск + ставит Celery-задачу parse_map_search.

    Режимы:
    - mode='city' (default): обязательны niche + city.
    - mode='radius': обязательны niche + address + radius_meters. Адрес
      геокодим через 2GIS API, координаты сохраняем в point_lat/lng.
      city подставляется из ответа геокода — для pain_tags по (niche, city).

    Если для всех sources уже свежий кэш — status='from_cache', Celery не ставим.
    Radius-режим не кэшируется.
    """
    # Радиус-режим: геокодим адрес через 2GIS и подставляем координаты + город.
    point_lat = None
    point_lng = None
    resolved_city = payload.city.strip()
    radius_address = None
    if payload.mode == "radius":
        if not payload.address or not payload.address.strip():
            raise HTTPException(status_code=400, detail="Для режима radius укажи address")
        if not payload.radius_meters:
            raise HTTPException(status_code=400, detail="Для режима radius укажи radius_meters")
        from app.modules.maps.providers.twogis import TwoGisProvider

        try:
            provider = TwoGisProvider()
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"2GIS API ключ не настроен: {e}")
        geo = await provider.geocode(payload.address.strip())
        if geo is None:
            raise HTTPException(
                status_code=404,
                detail=f"Не удалось найти адрес «{payload.address}» в 2GIS. Попробуй другой формат.",
            )
        point_lat = geo["lat"]
        point_lng = geo["lng"]
        resolved_city = geo.get("city") or payload.city.strip() or "—"
        radius_address = geo.get("matched") or payload.address.strip()
    elif not resolved_city or len(resolved_city) < 2:
        raise HTTPException(status_code=400, detail="city слишком короткий")

    search = await service.create_map_search(
        db,
        user_id=user_id,
        niche=payload.niche.strip(),
        city=resolved_city,
        sources=list(payload.sources),
        filters=payload.filters,
        mode=payload.mode,
        address=radius_address,
        point_lat=point_lat,
        point_lng=point_lng,
        radius_meters=payload.radius_meters,
    )

    if search.status == "pending":
        # ставим задачу только если кэш не отработал; импорт локальный — иначе circular
        from app.modules.maps.tasks import parse_map_search as parse_task
        parse_task.delay(search.id)
    elif search.status == "from_cache":
        # Кэш отработал и скопировал карточки, но у части компаний может не
        # быть отзывов — в прошлый раз parse_company_reviews для них мог
        # упасть на rate-limit / capche или быть потерян при перезапуске
        # Celery. Перепоставим задачи: те, у кого reviews_count > 0, не лезут
        # сюда; для остальных воркер сходит в 2GIS widget API ещё раз.
        missing = await service.list_search_companies_missing_reviews(db, search.id)
        if missing:
            from app.modules.maps.tasks import parse_company_reviews
            for company_id, source in missing:
                parse_company_reviews.delay(company_id, source)
            logger.info(
                "create_map_search #%d from_cache: enqueued %d parse_company_reviews tasks",
                search.id, len(missing),
            )

    return search


@router.get("/search/{search_id}", response_model=MapSearchOut)
@limiter.limit("60/minute")
async def get_map_search(
    request: Request,
    search_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Состояние поиска (статус, кол-во найденных, прогресс AI)."""
    return await _get_owned_search(db, search_id, user_id)


@router.get("/search/{search_id}/stream")
async def stream_map_search(
    search_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """SSE-стрим прогресса поиска. Шлёт уже найденные компании на старте,
    затем подписывается на Redis-канал maps_stream:{search_id}.
    Закрывается на event=done или при разрыве соединения клиентом.
    """
    search = await _get_owned_search(db, search_id, user_id)
    from app.modules.maps.sse import iter_search_events

    return StreamingResponse(
        iter_search_events(db, search),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # nginx: не буферить
            "Connection": "keep-alive",
        },
    )


@router.get("/search/{search_id}/companies", response_model=CompaniesListOut)
@limiter.limit("60/minute")
async def list_search_companies(
    request: Request,
    search_id: int,
    min_rating: Optional[float] = Query(default=None, ge=0, le=5),
    max_rating: Optional[float] = Query(default=None, ge=0, le=5),
    min_reviews: Optional[int] = Query(default=None, ge=0),
    min_negative: Optional[int] = Query(default=None, ge=0),
    has_owner_replies: Optional[bool] = Query(default=None),
    has_website: Optional[bool] = Query(default=None),
    pain_tag_ids: Optional[list[int]] = Query(default=None),
    min_pain_mentions: int = Query(default=1, ge=1),
    sort_by: SortBy = Query(default="rating_desc"),
    review_text_contains: Optional[str] = Query(default=None, max_length=200),
    review_text_excludes: Optional[str] = Query(default=None, max_length=200),
    review_text_contains_any: Optional[list[str]] = Query(default=None),
    review_text_excludes_any: Optional[list[str]] = Query(default=None),
    # Multi-source фильтр (ТЗ 2026-06-04): сегмент-переключатель в шапке.
    source_filter: Optional[str] = Query(default=None, regex="^(all|2gis|yandex_maps)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Возвращает страницу компаний поиска с фильтрами."""
    await _get_owned_search(db, search_id, user_id)
    flt = MapSearchFilter(
        min_rating=min_rating,
        max_rating=max_rating,
        min_reviews=min_reviews,
        min_negative=min_negative,
        has_owner_replies=has_owner_replies,
        has_website=has_website,
        pain_tag_ids=pain_tag_ids or None,
        min_pain_mentions=min_pain_mentions,
        sort_by=sort_by,
        review_text_contains=review_text_contains,
        review_text_excludes=review_text_excludes,
        review_text_contains_any=review_text_contains_any or None,
        review_text_excludes_any=review_text_excludes_any or None,
        source_filter=source_filter,
    )
    items, total = await service.get_search_results(db, search_id, flt, limit=limit, offset=offset)
    # Подгружаем топ-3 болей с цитатами одним запросом на всю страницу.
    pains_by_company = await service.get_top_pains_for_companies(db, [c.id for c in items], limit_per_company=3)
    # Fallback для карточек без AI-pain-анализа: 1-2 куска негативных отзывов.
    # Дёргаем только для тех, у кого top_pains пуст И есть негативы (иначе
    # лишняя SQL-нагрузка).
    snippets_targets = [c.id for c in items if not pains_by_company.get(c.id) and (c.reviews_negative_count or 0) > 0]
    negative_snippets_map = (
        await service.get_negative_snippets_for_companies(db, snippets_targets, limit_per_company=2)
        if snippets_targets
        else {}
    )
    # Блок 2 ТЗ: юр.данные из DaData одним запросом на страницу.
    from app.models.company_legal import CompanyLegal
    legal_map: dict[int, CompanyLegal] = {}
    if items:
        ids = [c.id for c in items]
        legals = (await db.execute(
            select(CompanyLegal).where(CompanyLegal.company_id.in_(ids))
        )).scalars().all()
        legal_map = {int(l.company_id): l for l in legals}
    # Phase 4 multi-source: источники + контакты per-source одним батчем.
    sources_map = await service.attach_sources_for_companies(db, [c.id for c in items])
    out_items: list[CompanyOut] = []
    for c in items:
        out = CompanyOut.model_validate(c)
        out.top_pains = [CompanyPainOut(**p) for p in pains_by_company.get(c.id, [])]
        if not out.top_pains:
            out.negative_snippets = negative_snippets_map.get(c.id, [])
        # sources_profiles: список источниковых профилей компании. У одноисточниковых
        # длина 1, у склеенных 2gis+yandex — 2 (после Phase 2/3).
        out.sources_profiles = [CompanySourceOut(**s) for s in sources_map.get(c.id, [])]
        legal = legal_map.get(c.id)
        if legal and legal.status == "ok":
            out.legal = CompanyLegalOut(
                inn=legal.inn,
                ogrn=legal.ogrn,
                legal_name=legal.legal_name,
                legal_short_name=legal.legal_short_name,
                registration_date=legal.registration_date.isoformat() if legal.registration_date else None,
                revenue=float(legal.revenue) if legal.revenue is not None else None,
                employee_count=legal.employee_count,
                legal_status=legal.legal_status,
                okved=legal.okved,
                okved_name=legal.okved_name,
                age_years=legal.age_years,
                match_confidence=float(legal.match_confidence) if legal.match_confidence is not None else None,
                matched_by=legal.matched_by,
            )
        out_items.append(out)
    # Multi-source: счётчики на ВСЕЙ выборке (без source_filter) — нужны фронту
    # чтобы рисовать «Все · 2GIS X · Я.Карты Y · в обоих Z» в шапке.
    try:
        counts_raw = await service.get_source_counts_for_search(db, search_id)
        source_counts = SourceCountsOut(
            total=counts_raw.get("total", 0),
            twogis=counts_raw.get("twogis", 0),
            yandex_maps=counts_raw.get("yandex_maps", 0),
            both=counts_raw.get("both", 0),
        )
    except Exception:
        logger.exception("source_counts compute failed for search_id=%d", search_id)
        source_counts = None
    return CompaniesListOut(
        items=out_items,
        total=total,
        limit=limit,
        offset=offset,
        source_counts=source_counts,
    )


@router.get("/search/{search_id}/export")
@limiter.limit("5/minute")
async def export_search_csv(
    request: Request,
    search_id: int,
    min_rating: Optional[float] = Query(default=None, ge=0, le=5),
    max_rating: Optional[float] = Query(default=None, ge=0, le=5),
    min_reviews: Optional[int] = Query(default=None, ge=0),
    min_negative: Optional[int] = Query(default=None, ge=0),
    has_owner_replies: Optional[bool] = Query(default=None),
    has_website: Optional[bool] = Query(default=None),
    pain_tag_ids: Optional[list[int]] = Query(default=None),
    sort_by: SortBy = Query(default="rating_desc"),
    review_text_contains: Optional[str] = Query(default=None, max_length=200),
    review_text_excludes: Optional[str] = Query(default=None, max_length=200),
    review_text_contains_any: Optional[list[str]] = Query(default=None),
    review_text_excludes_any: Optional[list[str]] = Query(default=None),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Экспорт компаний поиска в CSV (с теми же фильтрами что у /companies)."""
    await _get_owned_search(db, search_id, user_id)
    flt = MapSearchFilter(
        min_rating=min_rating, max_rating=max_rating,
        min_reviews=min_reviews, min_negative=min_negative,
        has_owner_replies=has_owner_replies,
        has_website=has_website,
        pain_tag_ids=pain_tag_ids or None,
        sort_by=sort_by,
        review_text_contains=review_text_contains,
        review_text_excludes=review_text_excludes,
        review_text_contains_any=review_text_contains_any or None,
        review_text_excludes_any=review_text_excludes_any or None,
    )
    items, _ = await service.get_search_results(db, search_id, flt, limit=2000, offset=0)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "name", "niche", "city", "address", "phone", "website",
        "rating", "reviews_count", "reviews_positive", "reviews_negative",
        "reviews_neutral", "has_owner_replies", "owner_replies_count",
        "last_review_at", "source",
    ])
    for c in items:
        writer.writerow([
            c.id, c.name or "", c.niche or "", c.city or "", c.address or "",
            c.phone or "", c.website or "",
            float(c.rating) if c.rating is not None else "",
            c.reviews_count or 0, c.reviews_positive_count or 0,
            c.reviews_negative_count or 0, c.reviews_neutral_count or 0,
            "yes" if c.has_owner_replies else "no",
            c.owner_replies_count or 0,
            c.last_review_at.isoformat() if c.last_review_at else "",
            c.source or "",
        ])
    output.seek(0)
    filename = f"maps_search_{search_id}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/search/{search_id}/pain-tags", response_model=list[PainTagOut])
@limiter.limit("60/minute")
async def search_pain_tags(
    request: Request,
    search_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Теги болей, которые реально встречаются у компаний этого поиска.

    JOIN company_pain_scores → pain_tags; группируем по pain_tag, считаем
    сумму mention_count. Сортировка по убыванию.
    """
    from app.models.maps import MapSearchResult
    from app.models.pain_tag import CompanyPainScore

    await _get_owned_search(db, search_id, user_id)

    q = (
        select(PainTag, sqlalchemy_func_sum_mention())
        .join(CompanyPainScore, CompanyPainScore.pain_tag_id == PainTag.id)
        .join(MapSearchResult, MapSearchResult.company_id == CompanyPainScore.company_id)
        .where(
            MapSearchResult.map_search_id == search_id,
            PainTag.status == "active",
        )
        .group_by(PainTag.id)
        .order_by(sqlalchemy_func_sum_mention().desc())
    )
    rows = list((await db.execute(q)).all())
    return [PainTagOut.model_validate(row[0]) for row in rows]


# ---------------------------------------------------------------------------
# Company detail
# ---------------------------------------------------------------------------


@router.get("/companies/{company_id}", response_model=CompanyDetailOut)
@limiter.limit("60/minute")
async def get_company(
    request: Request,
    company_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Карточка компании + 50 последних отзывов (вкладка «Все» в drawer).
    Лимит выровнен с /reviews?sentiment=...&limit=50, чтобы при переключении
    табов количество видимых отзывов не падало с 50 до 10."""
    company = await _get_company_or_404(db, company_id)
    recent = list(
        (await db.execute(
            select(Review)
            .where(Review.company_id == company.id)
            .order_by(Review.posted_at.desc().nullslast())
            .limit(50)
        )).scalars().all()
    )
    detail = CompanyDetailOut.model_validate(company)
    detail.recent_reviews = [ReviewOut.model_validate(r) for r in recent]
    pains_by_company = await service.get_top_pains_for_companies(db, [company.id], limit_per_company=5)
    detail.top_pains = [CompanyPainOut(**p) for p in pains_by_company.get(company.id, [])]
    # Phase 4 multi-source: источники + контакты per-source для drawer-карточки.
    sources_map = await service.attach_sources_for_companies(db, [company.id])
    detail.sources_profiles = [CompanySourceOut(**s) for s in sources_map.get(company.id, [])]

    # Блок 2 ТЗ: юр.данные из company_legal (DaData) — для блока в drawer.
    from app.models.company_legal import CompanyLegal
    legal = (await db.execute(
        select(CompanyLegal).where(CompanyLegal.company_id == company.id)
    )).scalar_one_or_none()
    if legal and legal.status == "ok":
        detail.legal = CompanyLegalOut(
            inn=legal.inn,
            ogrn=legal.ogrn,
            legal_name=legal.legal_name,
            legal_short_name=legal.legal_short_name,
            registration_date=legal.registration_date.isoformat() if legal.registration_date else None,
            revenue=float(legal.revenue) if legal.revenue is not None else None,
            employee_count=legal.employee_count,
            legal_status=legal.legal_status,
            okved=legal.okved,
            okved_name=legal.okved_name,
            age_years=legal.age_years,
            match_confidence=float(legal.match_confidence) if legal.match_confidence is not None else None,
            matched_by=legal.matched_by,
        )
    return detail


@router.get("/companies/{company_id}/reviews", response_model=ReviewsListOut)
@limiter.limit("60/minute")
async def list_company_reviews(
    request: Request,
    company_id: int,
    sentiment: Optional[str] = Query(default=None, regex="^(positive|negative|neutral)$"),
    text_contains: Optional[str] = Query(default=None, max_length=200),
    min_rating: Optional[int] = Query(default=None, ge=1, le=5),
    max_rating: Optional[int] = Query(default=None, ge=1, le=5),
    has_owner_reply: Optional[bool] = Query(default=None),
    # Phase 4 multi-source: фильтр для табов «Все / 2GIS / Я.Карты» в drawer.
    source: Optional[str] = Query(default=None, regex="^(2gis|yandex_maps|google)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    await _get_company_or_404(db, company_id)
    q = select(Review).where(Review.company_id == company_id)
    if sentiment:
        q = q.where(Review.sentiment == sentiment)
    if text_contains and text_contains.strip():
        q = q.where(Review.raw_text.ilike(f"%{text_contains.strip()}%"))
    if min_rating is not None:
        q = q.where(Review.rating >= min_rating)
    if max_rating is not None:
        q = q.where(Review.rating <= max_rating)
    if has_owner_reply is not None:
        q = q.where(Review.has_owner_reply == has_owner_reply)
    if source:
        q = q.where(Review.source == source)
    q = q.order_by(Review.posted_at.desc().nullslast())

    from sqlalchemy import func

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one() or 0
    items = list((await db.execute(q.limit(limit).offset(offset))).scalars().all())
    return ReviewsListOut(
        items=[ReviewOut.model_validate(r) for r in items],
        total=int(total),
        limit=limit,
        offset=offset,
    )


# ---------------------------------------------------------------------------
# Company digest (агрегат отзывов за период)
# ---------------------------------------------------------------------------


@router.get("/companies/{company_id}/digest", response_model=CompanyDigestOut)
@limiter.limit("60/minute")
async def get_company_digest(
    request: Request,
    company_id: int,
    days: int = Query(default=30, ge=1, le=365),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Сводка отзывов компании за N дней: счёт по sentiment, средний рейтинг,
    доля ответов владельца, топ-боли с цитатами.

    Используется в drawer'е компании, чтобы юзер одним взглядом понял
    «как сейчас себя чувствует» эта компания — нужно ли её включать в outreach,
    стоит ли использовать конкретную боль в письме.
    """
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    from sqlalchemy import func as _func

    company = await _get_company_or_404(db, company_id)
    since = _dt.now(_tz.utc) - _td(days=days)

    # Агрегаты по sentiment / rating / owner_reply одним запросом
    aggregate_row = (await db.execute(
        select(
            _func.count(Review.id),
            _func.sum(_func.case((Review.sentiment == "positive", 1), else_=0)),
            _func.sum(_func.case((Review.sentiment == "negative", 1), else_=0)),
            _func.sum(_func.case((Review.sentiment == "neutral", 1), else_=0)),
            _func.avg(Review.rating),
            _func.sum(_func.case((Review.has_owner_reply.is_(True), 1), else_=0)),
        )
        .where(Review.company_id == company_id, Review.posted_at >= since)
    )).one()
    total, pos, neg, neu, avg_r, owner_r = aggregate_row

    total_int = int(total or 0)
    owner_rate = (float(owner_r or 0) / total_int) if total_int else None

    pains_map = await service.get_top_pains_for_companies(db, [company_id], limit_per_company=5)
    pains = [CompanyPainOut(**p) for p in pains_map.get(company_id, [])]

    return CompanyDigestOut(
        company_id=company.id,
        days=days,
        total_reviews=total_int,
        positive_count=int(pos or 0),
        negative_count=int(neg or 0),
        neutral_count=int(neu or 0),
        avg_rating=float(avg_r) if avg_r is not None else None,
        owner_reply_rate=owner_rate,
        top_pains=pains,
    )


# ---------------------------------------------------------------------------
# Outreach draft (LLM)
# ---------------------------------------------------------------------------


@router.post("/companies/{company_id}/draft-email", response_model=OutreachDraftOut)
@limiter.limit("20/minute")
async def draft_email_for_company(
    request: Request,
    company_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Генерирует драфт холодного письма на основе компании + её топ-болей.

    Если для компании ещё нет pain_tags (анализ не прогонялся / ниша без
    реклассированных тегов) — возвращает 409 с человеческим объяснением,
    что нужно сначала прогнать reviews_ai.

    Если LLM-ассистент не настроен — 503.
    """
    company = await _get_company_or_404(db, company_id)

    pains_by_company = await service.get_top_pains_for_companies(db, [company.id], limit_per_company=3)
    pains = pains_by_company.get(company.id, [])
    pains_with_quote = [p for p in pains if p.get("top_quote")]
    if not pains_with_quote:
        raise HTTPException(
            status_code=409,
            detail=(
                "Для этой компании ещё нет болей с цитатами. "
                "Запусти AI-анализ отзывов и попробуй снова."
            ),
        )

    from app.modules.reviews_ai.llm import call_llm_outreach_draft

    draft = await call_llm_outreach_draft(
        db,
        company_name=company.name or "",
        niche=company.niche or "",
        city=company.city or "",
        source=company.source or "карты",
        pains=[
            {"label": p["label"], "quote": p.get("top_quote") or ""}
            for p in pains_with_quote
        ],
    )
    if draft is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "LLM-ассистент для генерации письма не настроен или временно недоступен. "
                "Проверь OPENAI_API_KEY / OPENAI_BASE_URL и наличие ассистента "
                "reviews_ai_outreach_draft в БД."
            ),
        )

    emails = company.emails if isinstance(company.emails, list) else []
    return OutreachDraftOut(
        company_id=company.id,
        company_name=company.name or "",
        subject=draft["subject"],
        body=draft["body"],
        used_pains=[CompanyPainOut(**p) for p in pains_with_quote],
        suggested_to_emails=list(emails)[:5],
    )


@router.post(
    "/companies/{company_id}/outreach-draft",
    response_model=OutreachDraftCachedOut,
)
@limiter.limit("20/minute")
async def outreach_draft_for_company(
    request: Request,
    company_id: int,
    payload: OutreachDraftRequest | None = None,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Aha-moment блок 1: драфт письма с угольной логикой + кэш.

    В отличие от старого /draft-email, этот endpoint:
      - принимает угол услуги (website/reputation/automation/seo/auto);
      - может работать даже когда у компании нет pain-тегов
        (генерит письмо чисто под угол — особенно полезно для website-угла);
      - кэширует результат в company_outreach_drafts по (company_id, angle);
        повторный вызов без regenerate отдаёт кэш и не жжёт токены LLM;
      - возвращает angle_used (для auto — конкретный выбранный угол) и
        pains_used (какие боли пошли в промпт).
    """
    company = await _get_company_or_404(db, company_id)
    req = payload or OutreachDraftRequest()

    from app.modules.maps.outreach_drafts import generate_or_get_draft

    result, error = await generate_or_get_draft(
        db,
        company,
        angle=req.angle,
        tone=req.tone,
        language=req.language,
        regenerate=req.regenerate,
    )
    if error is not None or result is None:
        # Если фейл LLM/ассистент — 503, чтобы UI мог показать «попробуй позже».
        raise HTTPException(
            status_code=503,
            detail=error or "Не удалось сгенерировать письмо",
        )

    emails = company.emails if isinstance(company.emails, list) else []
    return OutreachDraftCachedOut(
        company_id=company.id,
        company_name=company.name or "",
        subject=result.subject,
        body=result.body,
        angle_used=result.angle_used,
        tone=result.tone,
        language=result.language,
        pains_used=[
            CompanyPainOut(
                pain_tag_id=p.get("pain_tag_id") or 0,
                label=p.get("label") or "",
                mention_count=0,
                top_quote=p.get("top_quote"),
                top_quote_similarity=p.get("top_quote_similarity"),
            )
            for p in (result.pains_used or [])
            if p.get("pain_tag_id")
        ],
        suggested_to_emails=list(emails)[:5],
        cached=result.cached,
    )


# ---------------------------------------------------------------------------
# Heatmap (блок 5 ТЗ 2026-06-02)
# ---------------------------------------------------------------------------


@router.get("/heatmap")
@limiter.limit("60/minute")
async def get_heatmap(
    request: Request,
    search_id: int = Query(...),
    layer: str = Query(default="density"),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Возвращает массив точек {lat, lng, weight} для Leaflet.heat.

    layer — один из density / pain / website / rating / wealth. Подробнее
    см. docstring app/modules/maps/heatmap.py.
    """
    if layer not in ("density", "pain", "website", "rating", "wealth"):
        raise HTTPException(status_code=400, detail=f"unknown layer: {layer}")

    from app.modules.maps.heatmap import build_points

    points = await build_points(db, search_id, layer)  # type: ignore[arg-type]
    return {"layer": layer, "points": points, "count": len(points)}


# ---------------------------------------------------------------------------
# Admin: discover websites by handle (roadmap 2026-06-02)
# ---------------------------------------------------------------------------


@router.post("/admin/discover-websites")
@limiter.limit("5/minute")
async def admin_discover_websites(
    request: Request,
    search_id: int | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=5000),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Bulk-постановка discover_company_website по website-лидам без website.

    Применяет ко всем (или к компаниям конкретного search_id) website-лидам
    у которых website пустой. После прогона часть компаний получит
    реальный сайт (m23clinic.ru и т.п.) и уйдёт из website-лидов.
    """
    from app.modules.maps.tasks import discover_company_website

    stmt = (
        select(Company.id)
        .where(Company.website_lead_score.isnot(None))
        .where((Company.website.is_(None)) | (Company.website == ""))
        .limit(limit)
    )
    if search_id is not None:
        from app.models.maps import MapSearchResult
        stmt = stmt.join(
            MapSearchResult, MapSearchResult.company_id == Company.id
        ).where(MapSearchResult.map_search_id == search_id)

    rows = (await db.execute(stmt)).scalars().all()
    queued = 0
    for cid in rows:
        try:
            discover_company_website.delay(int(cid))
            queued += 1
        except Exception as e:
            logger.warning("discover_websites enqueue failed for #%s: %s", cid, e)
    return {"queued": queued}


# ---------------------------------------------------------------------------
# Admin: queue legal-enrichment (блок 2 ТЗ 2026-06-02)
# ---------------------------------------------------------------------------


@router.post("/admin/queue-legal")
@limiter.limit("5/minute")
async def admin_queue_legal_enrichment(
    request: Request,
    search_id: int | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=2000),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Ставит Celery-таски на обогащение юр.данными из DaData.

    - search_id: только компании из конкретного поиска (опц.).
    - limit: размер партии.

    Skip компаний, у которых уже есть запись в company_legal (любого
    статуса) — повторы делают вручную.
    """
    from app.models.company_legal import CompanyLegal
    from app.modules.maps.tasks import enrich_company_legal

    # company_id, у которых НЕТ записи в company_legal.
    sub = select(CompanyLegal.company_id)
    stmt = (
        select(Company.id)
        .where(Company.id.not_in(sub))
        .limit(limit)
    )
    if search_id is not None:
        from app.models.maps import MapSearchResult
        stmt = stmt.join(
            MapSearchResult, MapSearchResult.company_id == Company.id
        ).where(MapSearchResult.map_search_id == search_id)

    rows = (await db.execute(stmt)).scalars().all()
    queued = 0
    for cid in rows:
        try:
            enrich_company_legal.delay(int(cid))
            queued += 1
        except Exception as e:
            logger.warning("queue legal enqueue failed for #%s: %s", cid, e)
    return {"queued": queued}


# ---------------------------------------------------------------------------
# Admin: queue AI-descriptions for website leads (блок 4C ТЗ 2026-06-02)
# ---------------------------------------------------------------------------


@router.post("/admin/queue-descriptions")
@limiter.limit("5/minute")
async def admin_queue_company_descriptions(
    request: Request,
    search_id: int | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=2000),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Ставит Celery-таски на генерацию ai_description для website-лидов.

    Параметры:
      - search_id (опционально): только компании из конкретного поиска;
        без него — глобально (любые website-лиды без описания).
      - limit: сколько тасков поставить за один вызов.

    Полезно для разового прогрева перед первым экспортом Excel.
    """
    from app.modules.maps.tasks import generate_company_description

    stmt = (
        select(Company.id)
        .where(Company.ai_description.is_(None))
        .where(Company.website_lead_score.isnot(None))
        .limit(limit)
    )
    if search_id is not None:
        from app.models.maps import MapSearchResult
        stmt = stmt.join(
            MapSearchResult, MapSearchResult.company_id == Company.id
        ).where(MapSearchResult.map_search_id == search_id)

    rows = (await db.execute(stmt)).scalars().all()
    queued = 0
    for cid in rows:
        try:
            generate_company_description.delay(int(cid))
            queued += 1
        except Exception as e:
            logger.warning("queue desc enqueue failed for #%s: %s", cid, e)
    return {"queued": queued}


# ---------------------------------------------------------------------------
# Website leads Excel export (блок 4 ТЗ 2026-06-02)
# ---------------------------------------------------------------------------


@router.get("/website-leads/export")
@limiter.limit("10/minute")
async def export_website_leads_xlsx(
    request: Request,
    search_id: int = Query(...),
    only_website_leads: bool = Query(default=True),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Скачивание .xlsx с двумя вкладками: «Лиды» + «Производство сайта».

    - only_website_leads=true (дефолт): только компании без собственного
      сайта (website_lead_score IS NOT NULL).
    - only_website_leads=false: все компании поиска (общий экспорт).

    Файл собирается серверно openpyxl'ом, отдаётся как поток.
    """
    from fastapi.responses import Response
    from urllib.parse import quote

    from app.models.maps import MapSearch
    from app.modules.maps.website_leads_export import (
        build_filename,
        build_website_leads_xlsx,
    )

    # Проверяем что поиск существует — иначе 404.
    search_obj = await db.get(MapSearch, search_id)
    if search_obj is None:
        raise HTTPException(status_code=404, detail="search not found")

    blob = await build_website_leads_xlsx(
        db, search_id, only_website_leads=only_website_leads
    )
    filename = build_filename(search_obj)
    return Response(
        content=blob,
        media_type=(
            "application/vnd.openxmlformats-officedocument."
            "spreadsheetml.sheet"
        ),
        headers={
            # RFC 5987 для кириллицы в имени.
            "Content-Disposition": (
                f"attachment; filename*=UTF-8''{quote(filename)}"
            ),
        },
    )


# ---------------------------------------------------------------------------
# Admin: lead temperature recompute
# ---------------------------------------------------------------------------


@router.post("/admin/recompute-temperature")
@limiter.limit("2/minute")
async def admin_recompute_lead_temperature(
    request: Request,
    only_null: bool = Query(default=True),
    limit: int = Query(default=2000, ge=1, le=10000),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Одноразовый пересчёт lead_temperature для пачки компаний.

    Используется после миграции 024 чтобы прогреть кэш у уже спарсенных
    компаний (новые компании заполняются автоматически в save_companies_batch
    и в enrich-тасках).

    only_null=true — только компании с NULL (дефолт, не трогает уже
    посчитанные). limit ограничивает размер партии — повторяй несколько
    раз если компаний много.
    """
    from sqlalchemy import select as sa_select

    from app.modules.maps.lead_temperature import recompute_for_companies

    stmt = sa_select(Company.id)
    if only_null:
        stmt = stmt.where(Company.lead_temperature.is_(None))
    stmt = stmt.limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    if not rows:
        return {"processed": 0, "remaining_estimate": 0}

    processed = await recompute_for_companies(db, list(rows))
    await db.commit()

    # Грубая оценка остатка для удобства повторных вызовов из UI/curl.
    remaining_stmt = sa_select(sa_func.count(Company.id))
    if only_null:
        remaining_stmt = remaining_stmt.where(Company.lead_temperature.is_(None))
    remaining = (await db.execute(remaining_stmt)).scalar() or 0
    return {"processed": processed, "remaining_estimate": int(remaining)}


@router.post("/admin/recompute-website-score")
@limiter.limit("2/minute")
async def admin_recompute_website_score(
    request: Request,
    only_null: bool = Query(default=True),
    limit: int = Query(default=2000, ge=1, le=10000),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Одноразовый пересчёт website_lead_score (блок 4).

    Логика та же что recompute-temperature, но для website_lead_score.
    NB: only_null=true тут означает «компании, которым ещё не вычислили
    score». Помни что для компаний С активным сайтом score = NULL по
    дизайну (они не website-лиды) — в only_null режиме они каждый раз
    будут пересчитываться (и каждый раз получать NULL), это нормально.
    """
    from sqlalchemy import select as sa_select

    from app.modules.maps.website_lead_score import recompute_for_companies

    stmt = sa_select(Company.id)
    if only_null:
        stmt = stmt.where(Company.website_lead_score.is_(None))
    stmt = stmt.limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    if not rows:
        return {"processed": 0, "remaining_estimate": 0}

    processed = await recompute_for_companies(db, list(rows))
    await db.commit()

    remaining_stmt = sa_select(sa_func.count(Company.id))
    if only_null:
        remaining_stmt = remaining_stmt.where(Company.website_lead_score.is_(None))
    remaining = (await db.execute(remaining_stmt)).scalar() or 0
    return {"processed": processed, "remaining_estimate": int(remaining)}


# ---------------------------------------------------------------------------
# Metadata
# ---------------------------------------------------------------------------


@router.get("/cities", response_model=list[str])
async def list_cities():
    """Список городов для UI. Точный region_id есть только у части (см. CITY_TO_REGION_ID),
    для остальных используется fallback на «всю Россию» с фильтрацией по адресу."""
    return KNOWN_CITIES_FOR_UI


@router.get("/niche-suggestions", response_model=list[str])
async def niche_suggestions(q: str = Query(default="", min_length=0, max_length=100)):
    """Заглушка автокомплита ниш. До ШАГов 7-11 — статический список пресетов."""
    presets = [
        "стоматология", "автосервис", "ремонт квартир", "юридические услуги",
        "бухгалтерские услуги", "клининговая компания", "фитнес клуб",
        "доставка еды", "рекламное агентство", "строительные компании",
    ]
    if not q:
        return presets
    needle = q.strip().lower()
    return [p for p in presets if needle in p]


@router.get("/pain-tags", response_model=list[PainTagOut])
@limiter.limit("60/minute")
async def list_pain_tags(
    request: Request,
    niche: str = Query(..., min_length=1),
    city: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Активные pain_tags для (niche, city). Без city — глобальные теги ниши.

    Сортировка по occurrences_count DESC — самые «горячие» болевые точки сверху.
    """
    q = select(PainTag).where(PainTag.niche == niche, PainTag.status == "active")
    if city is None:
        q = q.where(PainTag.city.is_(None))
    else:
        # включаем и global (city=NULL), и city-specific
        q = q.where((PainTag.city == city) | (PainTag.city.is_(None)))
    q = q.order_by(PainTag.occurrences_count.desc())
    tags = list((await db.execute(q)).scalars().all())
    return [PainTagOut.model_validate(t) for t in tags]


@router.get("/health/providers", response_model=ProvidersHealthOut)
async def health_providers():
    """Текущий статус доступности провайдеров (без реальных HTTP-запросов).

    twogis: 'ok' если API-ключ задан, иначе 'no_api_key'.
    yandex_maps: 'ok' если USE_PROXY=true (без прокси быстро забанит), иначе 'no_proxy'.
    """
    twogis = "ok" if settings.TWOGIS_API_KEY else "no_api_key"
    yandex_maps = "ok" if settings.USE_PROXY else "no_proxy"
    return ProvidersHealthOut(twogis=twogis, yandex_maps=yandex_maps)
