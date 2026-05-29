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
    CompanyOut,
    CompanyPainOut,
    MapSearchCreate,
    MapSearchFilter,
    MapSearchOut,
    OutreachDraftOut,
    PainTagOut,
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
    pain_tag_ids: Optional[list[int]] = Query(default=None),
    min_pain_mentions: int = Query(default=1, ge=1),
    sort_by: SortBy = Query(default="rating_desc"),
    review_text_contains: Optional[str] = Query(default=None, max_length=200),
    review_text_excludes: Optional[str] = Query(default=None, max_length=200),
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
        pain_tag_ids=pain_tag_ids or None,
        min_pain_mentions=min_pain_mentions,
        sort_by=sort_by,
        review_text_contains=review_text_contains,
        review_text_excludes=review_text_excludes,
    )
    items, total = await service.get_search_results(db, search_id, flt, limit=limit, offset=offset)
    # Подгружаем топ-3 болей с цитатами одним запросом на всю страницу.
    pains_by_company = await service.get_top_pains_for_companies(db, [c.id for c in items], limit_per_company=3)
    out_items: list[CompanyOut] = []
    for c in items:
        out = CompanyOut.model_validate(c)
        out.top_pains = [CompanyPainOut(**p) for p in pains_by_company.get(c.id, [])]
        out_items.append(out)
    return CompaniesListOut(
        items=out_items,
        total=total,
        limit=limit,
        offset=offset,
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
    pain_tag_ids: Optional[list[int]] = Query(default=None),
    sort_by: SortBy = Query(default="rating_desc"),
    review_text_contains: Optional[str] = Query(default=None, max_length=200),
    review_text_excludes: Optional[str] = Query(default=None, max_length=200),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Экспорт компаний поиска в CSV (с теми же фильтрами что у /companies)."""
    await _get_owned_search(db, search_id, user_id)
    flt = MapSearchFilter(
        min_rating=min_rating, max_rating=max_rating,
        min_reviews=min_reviews, min_negative=min_negative,
        has_owner_replies=has_owner_replies,
        pain_tag_ids=pain_tag_ids or None,
        sort_by=sort_by,
        review_text_contains=review_text_contains,
        review_text_excludes=review_text_excludes,
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
