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

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.rate_limit import limiter
from app.models.maps import Company, MapSearch, Review
from app.modules.maps import service
from app.modules.maps.providers.twogis import CITY_TO_REGION_ID
from app.modules.maps.schemas import (
    CompaniesListOut,
    CompanyDetailOut,
    CompanyOut,
    MapSearchCreate,
    MapSearchFilter,
    MapSearchOut,
    ProvidersHealthOut,
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

    Если для всех sources уже свежий кэш — status='from_cache', Celery не ставим.
    """
    search = await service.create_map_search(
        db,
        user_id=user_id,
        niche=payload.niche.strip(),
        city=payload.city.strip(),
        sources=list(payload.sources),
        filters=payload.filters,
    )

    if search.status == "pending":
        # ставим задачу только если кэш не отработал; импорт локальный — иначе circular
        from app.modules.maps.tasks import parse_map_search as parse_task
        parse_task.delay(search.id)

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
    """SSE-стрим прогресса поиска. Реальная реализация — ШАГ 12 (Redis pub/sub)."""
    await _get_owned_search(db, search_id, user_id)
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="SSE streaming will be enabled in step 12",
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
    sort_by: SortBy = Query(default="rating_desc"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Возвращает страницу компаний поиска с фильтрами. pain_tag_ids фильтр
    появится в API после ШАГов 7-11; до этого pain_tags в карточках всегда [].
    """
    await _get_owned_search(db, search_id, user_id)
    flt = MapSearchFilter(
        min_rating=min_rating,
        max_rating=max_rating,
        min_reviews=min_reviews,
        min_negative=min_negative,
        has_owner_replies=has_owner_replies,
        sort_by=sort_by,
    )
    items, total = await service.get_search_results(db, search_id, flt, limit=limit, offset=offset)
    return CompaniesListOut(
        items=[CompanyOut.model_validate(c) for c in items],
        total=total,
        limit=limit,
        offset=offset,
    )


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
    """Карточка компании + 10 последних отзывов."""
    company = await _get_company_or_404(db, company_id)
    recent = list(
        (await db.execute(
            select(Review)
            .where(Review.company_id == company.id)
            .order_by(Review.posted_at.desc().nullslast())
            .limit(10)
        )).scalars().all()
    )
    detail = CompanyDetailOut.model_validate(company)
    detail.recent_reviews = [ReviewOut.model_validate(r) for r in recent]
    return detail


@router.get("/companies/{company_id}/reviews", response_model=ReviewsListOut)
@limiter.limit("60/minute")
async def list_company_reviews(
    request: Request,
    company_id: int,
    sentiment: Optional[str] = Query(default=None, regex="^(positive|negative|neutral)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    await _get_company_or_404(db, company_id)
    q = select(Review).where(Review.company_id == company_id)
    if sentiment:
        q = q.where(Review.sentiment == sentiment)
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
# Metadata
# ---------------------------------------------------------------------------


# Список городов, сразу с правильной заглавной буквой для UI.
_CITIES_CAPITALIZED = sorted({c.capitalize() for c in CITY_TO_REGION_ID.keys()})


@router.get("/cities", response_model=list[str])
async def list_cities():
    """Список городов, для которых у 2GIS есть точный region_id. Остальные — fallback."""
    return _CITIES_CAPITALIZED


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


@router.get("/pain-tags", response_model=list[dict])
async def list_pain_tags(
    niche: str = Query(...),
    city: Optional[str] = Query(default=None),
):
    """Заглушка до ШАГов 7-11 (модуль reviews_ai). Возвращает пустой список."""
    _ = niche, city
    return []


@router.get("/health/providers", response_model=ProvidersHealthOut)
async def health_providers():
    """Текущий статус доступности провайдеров (без реальных HTTP-запросов).

    twogis: 'ok' если API-ключ задан, иначе 'no_api_key'.
    yandex_maps: 'ok' если USE_PROXY=true (без прокси быстро забанит), иначе 'no_proxy'.
    """
    twogis = "ok" if settings.TWOGIS_API_KEY else "no_api_key"
    yandex_maps = "ok" if settings.USE_PROXY else "no_proxy"
    return ProvidersHealthOut(twogis=twogis, yandex_maps=yandex_maps)
