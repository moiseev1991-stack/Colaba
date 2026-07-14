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
from sqlalchemy import and_, case as sa_case, func as sa_func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession


def sqlalchemy_func_sum_mention():
    """Хелпер для повторного использования агрегата SUM(company_pain_scores.mention_count)."""
    from app.models.pain_tag import CompanyPainScore
    return sa_func.sum(CompanyPainScore.mention_count)

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user_id, require_superuser


async def _superuser_id(user=Depends(require_superuser)) -> int:
    """Зависимость: требует суперпользователя и возвращает его id.

    Используется в admin-handler'ах, которым нужен user_id в теле функции
    (например для проверки владения). Семантически эквивалентно
    `Depends(require_superuser)` + `user.id`.
    """
    return user.id
from app.core.rate_limit import limiter
from app.models.maps import Company, MapSearch, Review
from app.models.pain_tag import PainTag
from app.modules.maps import service
from app.modules.maps.providers.twogis import CITY_TO_REGION_ID, KNOWN_CITIES_FOR_UI
from app.modules.maps.schemas import (
    CompaniesByPainListOut,
    CompaniesListOut,
    CompanyByPainOut,
    CompanyDetailOut,
    CompanyDigestOut,
    CompanyLegalOut,
    CompanyOut,
    CompanyPainOut,
    CompanySourceOut,
    HeatmapOut,
    HeatmapPoint,
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

# Подключаем под-роутер настроек провайдеров карт (2GIS / Yandex / Google).
# Эндпоинты живут под /maps/providers-settings/*.
from app.modules.maps.providers_settings_router import router as providers_settings_router  # noqa: E402

router.include_router(providers_settings_router)


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

        # 2026-07-13: from_cache-ветка НИКОГДА не запускала reviews_ai для
        # компаний с уже спарсенными отзывами. Из-за этого pilot bulk-парс
        # 12.07 наполнил БД кешированными компаниями по 5 нишам, но
        # /app/pains показывал 0 везде — sentiment/embeddings не считались,
        # pain_tags не строились. Теперь для КАЖДОЙ компании поиска ставим
        # analyze_reviews_for_company (идемпотентно — no-op если отзывы
        # уже AI-обработаны), а потом с countdown=180с — recluster всей
        # ниши/города. Пилот от cache-hit-ниш получит те же pain_tags, что
        # и от свежепарсенных.
        if search.niche and search.city:
            all_company_ids = await service.list_search_all_company_ids(db, search.id)
            if all_company_ids:
                try:
                    from app.modules.reviews_ai.tasks import (
                        analyze_reviews_for_company,
                        recluster_pains_for_niche_task,
                    )
                    for cid in all_company_ids:
                        analyze_reviews_for_company.delay(cid)
                    recluster_pains_for_niche_task.apply_async(
                        args=[search.niche, search.city],
                        countdown=180,
                    )
                    logger.info(
                        "create_map_search #%d from_cache: enqueued analyze for %d companies + recluster (%r, %r) in 180s",
                        search.id, len(all_company_ids), search.niche, search.city,
                    )
                except Exception as e:
                    logger.warning(
                        "create_map_search #%d from_cache: failed to trigger reviews_ai: %s",
                        search.id, e,
                    )

    return search


@router.get("/searches", response_model=list[MapSearchOut])
@limiter.limit("60/minute")
async def list_my_map_searches(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Список maps-поисков пользователя, новые сверху. Для страницы
    «История» — раньше maps-поиски нигде не отображались списком,
    можно было только знать ID и попасть на /app/leads напрямую."""
    from sqlalchemy import desc
    from app.models.maps import MapSearch

    stmt = (
        select(MapSearch)
        .where(MapSearch.user_id == user_id)
        .order_by(desc(MapSearch.created_at))
        .limit(limit)
        .offset(offset)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [MapSearchOut.model_validate(r) for r in rows]


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
    has_lpr: Optional[bool] = Query(default=None),
    pain_tag_ids: Optional[list[int]] = Query(default=None),
    min_pain_mentions: int = Query(default=1, ge=1),
    sort_by: SortBy = Query(default="rating_desc"),
    review_text_contains: Optional[str] = Query(default=None, max_length=200),
    review_text_excludes: Optional[str] = Query(default=None, max_length=200),
    review_text_contains_any: Optional[list[str]] = Query(default=None),
    review_text_excludes_any: Optional[list[str]] = Query(default=None),
    # Multi-source фильтр (ТЗ 2026-06-04): сегмент-переключатель в шапке.
    source_filter: Optional[str] = Query(default=None, regex="^(all|2gis|yandex_maps|google_maps)$"),
    # 2026-06-19: фильтр «Тип юр.лица» (multi-select). Спец-значение
    # '__unknown__' = «компании без opf». OR между значениями.
    opf_in: Optional[list[str]] = Query(default=None),
    # ТЗ Marketing-DM 2026-06-20 §4.2: пресет «ищут маркетолога».
    hiring_marketing: Optional[bool] = Query(default=None),
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
        has_lpr=has_lpr,
        pain_tag_ids=pain_tag_ids or None,
        min_pain_mentions=min_pain_mentions,
        sort_by=sort_by,
        review_text_contains=review_text_contains,
        review_text_excludes=review_text_excludes,
        review_text_contains_any=review_text_contains_any or None,
        review_text_excludes_any=review_text_excludes_any or None,
        source_filter=source_filter,
        opf_in=opf_in or None,
        hiring_marketing=hiring_marketing,
    )
    items, total = await service.get_search_results(db, search_id, flt, limit=limit, offset=offset)
    # Подгружаем топ-3 болей с цитатами одним запросом на всю страницу.
    # Если юзер кликнул конкретную плитку «топ-болей» (pain_tag_ids в URL) —
    # эта боль показывается в карточке первой, иначе сортировка по
    # mention_count DESC.
    pains_by_company = await service.get_top_pains_for_companies(
        db,
        [c.id for c in items],
        limit_per_company=3,
        priority_pain_tag_ids=pain_tag_ids or None,
    )
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
    # 2026-06-12: батчевая загрузка «есть ли decision_maker'ы на сайте» —
    # для pill «ЛПР» в карточке. Один запрос на страницу + dedup в set.
    from app.models.company_decision_maker import CompanyDecisionMaker
    dm_company_ids: set[int] = set()
    if items:
        ids = [c.id for c in items]
        dm_rows = (await db.execute(
            select(CompanyDecisionMaker.company_id).where(
                CompanyDecisionMaker.company_id.in_(ids)
            )
        )).all()
        dm_company_ids = {int(r[0]) for r in dm_rows}
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
        # ЛПР есть, если либо DaData отдала директора, либо парсер сайта
        # положил хотя бы одну запись decision_maker.
        legal_has_director = bool(
            legal
            and legal.status == "ok"
            and legal.director_name
            and legal.director_name.strip()
        )
        out.has_lpr = legal_has_director or (c.id in dm_company_ids)
        if legal and legal.status == "ok":
            out.legal = CompanyLegalOut(
                inn=legal.inn,
                ogrn=legal.ogrn,
                legal_name=legal.legal_name,
                legal_short_name=legal.legal_short_name,
                opf=legal.opf,
                registration_date=legal.registration_date.isoformat() if legal.registration_date else None,
                revenue=float(legal.revenue) if legal.revenue is not None else None,
                employee_count=legal.employee_count,
                legal_status=legal.legal_status,
                okved=legal.okved,
                okved_name=legal.okved_name,
                age_years=legal.age_years,
                match_confidence=float(legal.match_confidence) if legal.match_confidence is not None else None,
                matched_by=legal.matched_by,
                director_name=legal.director_name,
                director_post=legal.director_post,
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


@router.get("/search/{search_id}/heatmap", response_model=HeatmapOut)
@limiter.limit("30/minute")
async def get_search_heatmap(
    request: Request,
    search_id: int,
    layer: str = Query(default="density", regex="^(density|pain|website|rating|wealth|pain_type)$"),
    source_filter: Optional[str] = Query(default=None, regex="^(all|2gis|yandex_maps|google_maps)$"),
    # §2 ТЗ 2026-06-10: pain_type-слой требует конкретный pain_tag_id.
    pain_tag_id: Optional[int] = Query(default=None),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Возвращает точки для Leaflet.heat поверх карты выдачи (блок 5 ТЗ 2026-06-02).

    Слои:
      - density: каждая компания weight=1 → плотность концентрации.
      - pain: weight = reviews_negative_count (нормализовано к max) → где
        больше всего недовольных клиентов в нише.
      - website: weight = website_lead_score / 100 → где плотность лидов
        «продать сайт». Компании с уже работающим сайтом исключаются.
      - rating: weight = (4 - rating)/4 для rating<4, иначе 0 → проблемные
        зоны репутации.
      - wealth: weight = log10(revenue+1)/8 → где сидят денежные компании
        по DaData. Без DaData = пусто.

    Грузим всю выборку поиска (без пагинации), берём только компании с
    координатами. Без фильтров по рейтингу/болям — heatmap должен
    показывать целостную картину ниши, а не сужать её.
    """
    await _get_owned_search(db, search_id, user_id)

    # Берём всю выборку поиска под source_filter (без других фильтров).
    flt = MapSearchFilter(source_filter=source_filter)
    items, total = await service.get_search_results(
        db, search_id, flt, limit=2000, offset=0
    )

    points: list[HeatmapPoint] = []
    max_intensity = 1.0
    contributing = 0

    if layer == "density":
        for c in items:
            if c.lat is None or c.lng is None:
                continue
            points.append(HeatmapPoint(lat=float(c.lat), lng=float(c.lng), weight=1.0))
            contributing += 1
        max_intensity = 1.0

    elif layer == "pain":
        # Нормализуем reviews_negative_count к max-у в выборке, чтобы heat-карта
        # была сравнимой между разными нишами/городами (50 негативов в кофейне
        # ≠ 50 негативов в крупном медцентре, но в рамках одной выборки шкала
        # «относительно лидера» уместна).
        raw = [
            (float(c.lat), float(c.lng), int(c.reviews_negative_count or 0))
            for c in items
            if c.lat is not None and c.lng is not None and (c.reviews_negative_count or 0) > 0
        ]
        peak = max((w for _, _, w in raw), default=1)
        for lat, lng, w in raw:
            points.append(HeatmapPoint(lat=lat, lng=lng, weight=w / peak))
            contributing += 1
        max_intensity = 1.0

    elif layer == "website":
        # website_lead_score уже 0..100 (NULL = у компании есть сайт, не
        # website-лид → пропускаем).
        for c in items:
            if c.lat is None or c.lng is None:
                continue
            score = getattr(c, "website_lead_score", None)
            if score is None or score <= 0:
                continue
            points.append(
                HeatmapPoint(lat=float(c.lat), lng=float(c.lng), weight=float(score) / 100.0)
            )
            contributing += 1
        max_intensity = 1.0

    elif layer == "rating":
        # Фокус на проблемной репутации: компании с rating<4 дают вес,
        # выше = хуже. rating IS NULL пропускаем (нет данных).
        for c in items:
            if c.lat is None or c.lng is None:
                continue
            r = float(c.rating) if c.rating is not None else None
            if r is None or r >= 4.0:
                continue
            weight = (4.0 - r) / 4.0
            points.append(
                HeatmapPoint(lat=float(c.lat), lng=float(c.lng), weight=weight)
            )
            contributing += 1
        max_intensity = 1.0

    elif layer == "wealth":
        # log-нормировка по DaData revenue. Без DaData-матча компании
        # пропускаются (legal is None).
        import math
        for c in items:
            if c.lat is None or c.lng is None:
                continue
            legal = getattr(c, "legal", None)
            revenue = getattr(legal, "revenue", None) if legal else None
            if revenue is None or revenue <= 0:
                continue
            # log10(revenue/1k+1) / 8 даёт ~1.0 для 10 млрд ₽, ~0.5 для 1 млн ₽.
            weight = min(1.0, math.log10(float(revenue) / 1000.0 + 1.0) / 8.0)
            points.append(
                HeatmapPoint(lat=float(c.lat), lng=float(c.lng), weight=weight)
            )
            contributing += 1
        max_intensity = 1.0

    elif layer == "pain_type":
        # §2 ТЗ 2026-06-10. Тепло по конкретной боли: где компании с
        # большим числом упоминаний этого pain-кластера. Без pain_tag_id —
        # возвращаем пустой результат (UI должен выставить значение).
        if pain_tag_id is None:
            return HeatmapOut(
                layer=layer,
                points=[],
                max_intensity=1.0,
                total_companies=total,
                contributing=0,
            )
        from app.models.pain_tag import CompanyPainScore
        ids = [c.id for c in items if c.lat is not None and c.lng is not None]
        if not ids:
            return HeatmapOut(
                layer=layer,
                points=[],
                max_intensity=1.0,
                total_companies=total,
                contributing=0,
            )
        rows = (await db.execute(
            select(CompanyPainScore.company_id, CompanyPainScore.mention_count).where(
                CompanyPainScore.pain_tag_id == pain_tag_id,
                CompanyPainScore.company_id.in_(ids),
                CompanyPainScore.mention_count > 0,
            )
        )).all()
        if not rows:
            return HeatmapOut(
                layer=layer,
                points=[],
                max_intensity=1.0,
                total_companies=total,
                contributing=0,
            )
        by_company = {int(cid): int(mc) for cid, mc in rows}
        peak = max(by_company.values()) if by_company else 1
        for c in items:
            mc = by_company.get(c.id, 0)
            if mc <= 0 or c.lat is None or c.lng is None:
                continue
            points.append(
                HeatmapPoint(
                    lat=float(c.lat),
                    lng=float(c.lng),
                    weight=mc / peak,
                )
            )
            contributing += 1
        max_intensity = 1.0

    return HeatmapOut(
        layer=layer,
        points=points,
        max_intensity=max_intensity,
        total_companies=total,
        contributing=contributing,
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
    has_lpr: Optional[bool] = Query(default=None),
    hiring_marketing: Optional[bool] = Query(default=None),
    pain_tag_ids: Optional[list[int]] = Query(default=None),
    sort_by: SortBy = Query(default="rating_desc"),
    review_text_contains: Optional[str] = Query(default=None, max_length=200),
    review_text_excludes: Optional[str] = Query(default=None, max_length=200),
    review_text_contains_any: Optional[list[str]] = Query(default=None),
    review_text_excludes_any: Optional[list[str]] = Query(default=None),
    company_ids: Optional[list[int]] = Query(default=None),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Экспорт компаний поиска в CSV.

    Два режима:
    - **Без `company_ids`** (default) — экспорт всех компаний поиска с теми же
      фильтрами что у `/companies`.
    - **С `company_ids`** — экспорт только выбранных карточек (bulk-toolbar
      «CSV выбранных»). Фильтры игнорируются: юзер уже явно отметил нужные
      строки чекбоксами, фильтры теряют смысл и могут сократить выдачу
      неожиданно. Привязка к `search_id` сохраняется — нельзя экспортнуть
      чужие компании, подсунув их id.
    """
    await _get_owned_search(db, search_id, user_id)
    if company_ids:
        from app.models.maps import MapSearchResult
        q = (
            select(Company)
            .join(MapSearchResult, MapSearchResult.company_id == Company.id)
            .where(MapSearchResult.map_search_id == search_id)
            .where(Company.id.in_(company_ids))
        )
        items = list((await db.execute(q)).scalars().all())
    else:
        flt = MapSearchFilter(
            min_rating=min_rating, max_rating=max_rating,
            min_reviews=min_reviews, min_negative=min_negative,
            has_owner_replies=has_owner_replies,
            has_website=has_website,
            has_lpr=has_lpr,
            pain_tag_ids=pain_tag_ids or None,
            sort_by=sort_by,
            review_text_contains=review_text_contains,
            review_text_excludes=review_text_excludes,
            review_text_contains_any=review_text_contains_any or None,
            review_text_excludes_any=review_text_excludes_any or None,
            hiring_marketing=hiring_marketing,
        )
        items, _ = await service.get_search_results(db, search_id, flt, limit=2000, offset=0)

    # Excel в русской локали по умолчанию открывает CSV как Windows-1251.
    # Чтобы он понял UTF-8 — добавляем BOM (﻿) в начало файла.
    # Разделитель ";" вместо "," — это стандарт CSV для русской локали
    # Excel (List separator из ОС). С "," Excel в RU всё пишет в одну колонку.
    output = io.StringIO()
    output.write("﻿")
    writer = csv.writer(output, delimiter=";")
    writer.writerow([
        "id", "name", "niche", "city", "address", "phone", "website",
        "rating", "reviews_count", "reviews_positive", "reviews_negative",
        "reviews_neutral", "has_owner_replies", "owner_replies_count",
        "last_review_at", "source",
        # 2026-06-12: ЛПР в экспорте — юзер просил.
        # lpr_name + lpr_post: ФИО + должность директора. Источник:
        #   1) CompanyLegal.director_name (DaData) — приоритет, точные данные
        #      по ИНН.
        #   2) первый is_decision_maker=True из CompanyDecisionMaker (сайт)
        #      — fallback если DaData не нашла матч.
        # lpr_source: 'dadata' / 'website' / '' — чтобы юзер видел откуда.
        "lpr_name", "lpr_post", "lpr_source",
    ])

    # Батчевая загрузка ЛПР: DaData director_name + первый decision_maker.
    # Один запрос на всю выгрузку, не N+1.
    from app.models.company_legal import CompanyLegal
    from app.models.company_decision_maker import CompanyDecisionMaker

    item_ids = [c.id for c in items]
    legal_by_company: dict[int, CompanyLegal] = {}
    dm_by_company: dict[int, CompanyDecisionMaker] = {}
    if item_ids:
        legals = (await db.execute(
            select(CompanyLegal).where(CompanyLegal.company_id.in_(item_ids))
        )).scalars().all()
        legal_by_company = {int(l.company_id): l for l in legals}
        # Берём всех is_decision_maker=True, упорядоченных по confidence —
        # первый на компанию это «самый уверенный» ЛПР.
        dms = (await db.execute(
            select(CompanyDecisionMaker)
            .where(
                CompanyDecisionMaker.company_id.in_(item_ids),
                CompanyDecisionMaker.is_decision_maker.is_(True),
            )
            .order_by(
                CompanyDecisionMaker.company_id.asc(),
                CompanyDecisionMaker.confidence.desc().nullslast(),
                CompanyDecisionMaker.id.asc(),
            )
        )).scalars().all()
        for dm in dms:
            if int(dm.company_id) not in dm_by_company:
                dm_by_company[int(dm.company_id)] = dm

    for c in items:
        legal = legal_by_company.get(c.id)
        dm = dm_by_company.get(c.id)
        lpr_name = ""
        lpr_post = ""
        lpr_source = ""
        if legal and legal.status == "ok" and legal.director_name and legal.director_name.strip():
            lpr_name = legal.director_name.strip()
            lpr_post = (legal.director_post or "").strip()
            lpr_source = "dadata"
        elif dm:
            lpr_name = (dm.name or "").strip()
            lpr_post = (dm.post or "").strip()
            lpr_source = "website"

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
            lpr_name, lpr_post, lpr_source,
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
            opf=legal.opf,
            registration_date=legal.registration_date.isoformat() if legal.registration_date else None,
            revenue=float(legal.revenue) if legal.revenue is not None else None,
            employee_count=legal.employee_count,
            legal_status=legal.legal_status,
            okved=legal.okved,
            okved_name=legal.okved_name,
            age_years=legal.age_years,
            match_confidence=float(legal.match_confidence) if legal.match_confidence is not None else None,
            matched_by=legal.matched_by,
            director_name=legal.director_name,
            director_post=legal.director_post,
        )

    # ТЗ A.2 2026-06-04: ЛПР со страниц сайта (Celery-таск enrich_company_team).
    # Возвращаем все is_decision_maker=true первыми, затем остальные сотрудники
    # (если они вообще есть — на /контактах часто перечислены менеджеры).
    from app.models.company_decision_maker import CompanyDecisionMaker
    from app.modules.maps.schemas import DecisionMakerOut
    dm_rows = (await db.execute(
        select(CompanyDecisionMaker)
        .where(CompanyDecisionMaker.company_id == company.id)
        .order_by(
            CompanyDecisionMaker.is_decision_maker.desc(),
            CompanyDecisionMaker.confidence.desc(),
            CompanyDecisionMaker.id.asc(),
        )
    )).scalars().all()
    detail.decision_makers = [
        DecisionMakerOut(
            name=r.name,
            post=r.post,
            source=r.source,
            source_url=r.source_url,
            confidence=float(r.confidence) if r.confidence is not None else None,
            is_decision_maker=bool(r.is_decision_maker),
            role_category=r.role_category,
            is_marketing_dm=bool(r.is_marketing_dm),
            contact_type=r.contact_type,
            contact_value=r.contact_value,
            egrn_matches_founder=r.egrn_matches_founder,
        )
        for r in dm_rows
    ]
    # has_lpr: DaData-директор или хоть один decision_maker со страниц сайта.
    legal_has_director = bool(
        detail.legal
        and detail.legal.director_name
        and detail.legal.director_name.strip()
    )
    detail.has_lpr = legal_has_director or bool(dm_rows)
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
    # Юзер 2026-06-10: клик по pain-плитке в карточке → список отзывов
    # этого кластера. Фильтрует через ReviewPainTag-join.
    pain_tag_id: Optional[int] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    await _get_company_or_404(db, company_id)
    q = select(Review).where(Review.company_id == company_id)
    if pain_tag_id is not None:
        from app.models.pain_tag import ReviewPainTag
        q = q.join(
            ReviewPainTag, ReviewPainTag.review_id == Review.id
        ).where(ReviewPainTag.pain_tag_id == pain_tag_id)
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


@router.get("/companies/{company_id}/pain-tag/{pain_tag_id}/trend")
@limiter.limit("60/minute")
async def get_company_pain_trend(
    request: Request,
    company_id: int,
    pain_tag_id: int,
    source: Optional[str] = Query(default=None, regex="^(2gis|yandex_maps|google)$"),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Динамика конкретной боли по месяцам для одной компании.

    Юзер 2026-06-10: нужно видеть когда жалобы по теме «Долгое ожидание»
    участились — может конкретный месяц/квартал. С фильтром по источнику
    (2GIS / Я.Карты / все) — графика показывает раздельно или вместе.

    Возвращает массив точек {month, count, source} где month = 'YYYY-MM',
    плюс range_start/range_end для оси X. Если данных нет — пустой массив.
    """
    await _get_company_or_404(db, company_id)
    from app.models.pain_tag import ReviewPainTag
    from sqlalchemy import func as sa_func2

    base = (
        select(
            sa_func2.to_char(sa_func2.date_trunc("month", Review.posted_at), "YYYY-MM").label("month"),
            Review.source.label("source"),
            sa_func2.count(Review.id).label("count"),
        )
        .join(ReviewPainTag, ReviewPainTag.review_id == Review.id)
        .where(
            Review.company_id == company_id,
            ReviewPainTag.pain_tag_id == pain_tag_id,
            Review.posted_at.isnot(None),
        )
        .group_by("month", Review.source)
        .order_by("month")
    )
    if source:
        base = base.where(Review.source == source)
    rows = list((await db.execute(base)).all())

    points = [
        {"month": r[0], "source": r[1], "count": int(r[2])}
        for r in rows
    ]
    range_start = points[0]["month"] if points else None
    range_end = points[-1]["month"] if points else None

    # Также сразу даём диапазон first→last posted_at без агрегации по
    # месяцам — для текстового «12.03–28.05» рядом с pain-плиткой (3-A).
    bounds_row = (
        await db.execute(
            select(
                sa_func2.min(Review.posted_at),
                sa_func2.max(Review.posted_at),
                sa_func2.count(Review.id),
            )
            .join(ReviewPainTag, ReviewPainTag.review_id == Review.id)
            .where(
                Review.company_id == company_id,
                ReviewPainTag.pain_tag_id == pain_tag_id,
            )
        )
    ).one()
    first_at, last_at, total = bounds_row
    return {
        "company_id": company_id,
        "pain_tag_id": pain_tag_id,
        "source_filter": source,
        "first_review_at": first_at.isoformat() if first_at else None,
        "last_review_at": last_at.isoformat() if last_at else None,
        "total_reviews": int(total or 0),
        "range_start": range_start,
        "range_end": range_end,
        "points": points,
    }


@router.get("/insights/pain-trend")
@limiter.limit("60/minute")
async def get_niche_pain_trend(
    request: Request,
    niche: str = Query(..., min_length=1),
    pain_tag_id: int = Query(...),
    city: Optional[str] = Query(default=None),
    source: Optional[str] = Query(default=None, regex="^(2gis|yandex_maps|google)$"),
    date_from: Optional[str] = Query(default=None, alias="from"),
    date_to: Optional[str] = Query(default=None, alias="to"),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """§B (юзер 2026-06-10): динамика боли по ВСЕЙ нише+городу, не только
    одной компании. Аналог /companies/{id}/pain-tag/{painId}/trend, но JOIN
    не ограничен company_id — берёт reviews всех компаний этой ниши.

    Источник может быть отфильтрован (2GIS / Я.Карты / Google). Если future
    Google source появится — фронт уже различает его цветом в chart.

    Период `from`/`to` (ISO date) сужает posted_at — для UI «последние 90 дней».
    """
    from datetime import datetime
    from app.models.pain_tag import ReviewPainTag

    def _parse(d: str | None) -> datetime | None:
        if not d:
            return None
        try:
            return datetime.fromisoformat(d)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"invalid date '{d}'") from exc

    dt_from = _parse(date_from)
    dt_to = _parse(date_to)

    company_filter = [Company.niche == niche]
    if city is not None:
        company_filter.append(Company.city == city)

    review_window = [Review.posted_at.isnot(None)]
    if source:
        review_window.append(Review.source == source)
    if dt_from is not None:
        review_window.append(Review.posted_at >= dt_from)
    if dt_to is not None:
        review_window.append(Review.posted_at <= dt_to)

    base = (
        select(
            sa_func.to_char(sa_func.date_trunc("month", Review.posted_at), "YYYY-MM").label("month"),
            Review.source.label("source"),
            sa_func.count(Review.id).label("count"),
        )
        .join(ReviewPainTag, ReviewPainTag.review_id == Review.id)
        .join(Company, Company.id == Review.company_id)
        .where(
            ReviewPainTag.pain_tag_id == pain_tag_id,
            *review_window,
            *company_filter,
        )
        .group_by("month", Review.source)
        .order_by("month")
    )
    rows = list((await db.execute(base)).all())
    points = [
        {"month": r[0], "source": r[1], "count": int(r[2])}
        for r in rows
    ]
    range_start = points[0]["month"] if points else None
    range_end = points[-1]["month"] if points else None

    bounds_filters = [ReviewPainTag.pain_tag_id == pain_tag_id, *company_filter]
    if source:
        bounds_filters.append(Review.source == source)
    if dt_from is not None:
        bounds_filters.append(Review.posted_at >= dt_from)
    if dt_to is not None:
        bounds_filters.append(Review.posted_at <= dt_to)
    bounds_row = (
        await db.execute(
            select(
                sa_func.min(Review.posted_at),
                sa_func.max(Review.posted_at),
                sa_func.count(Review.id),
                sa_func.count(sa_func.distinct(Review.company_id)),
            )
            .join(ReviewPainTag, ReviewPainTag.review_id == Review.id)
            .join(Company, Company.id == Review.company_id)
            .where(*bounds_filters)
        )
    ).one()
    first_at, last_at, total, companies_affected = bounds_row
    return {
        "niche": niche,
        "city": city,
        "pain_tag_id": pain_tag_id,
        "source_filter": source,
        "first_review_at": first_at.isoformat() if first_at else None,
        "last_review_at": last_at.isoformat() if last_at else None,
        "total_reviews": int(total or 0),
        "companies_affected": int(companies_affected or 0),
        "range_start": range_start,
        "range_end": range_end,
        "points": points,
    }


@router.get("/insights/reviews-trend")
@limiter.limit("60/minute")
async def get_niche_reviews_trend(
    request: Request,
    niche: str = Query(..., min_length=1),
    city: Optional[str] = Query(default=None),
    source: Optional[str] = Query(default=None, regex="^(2gis|yandex_maps|google)$"),
    date_from: Optional[str] = Query(default=None, alias="from"),
    date_to: Optional[str] = Query(default=None, alias="to"),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Динамика ВСЕХ отзывов в нише+городе по месяцам (юзер 2026-06-12).

    То же что /insights/pain-trend, но без фильтра pain_tag_id — показывает
    общую активность отзывов (позитив + негатив + нейтрал) по нише. Юзер
    хочет видеть его в шапке выдачи всегда, чтобы понимать общую динамику
    интереса к нише, а не только когда выбрана конкретная боль.

    Shape ответа совпадает с pain-trend — фронт переиспользует тот же
    компонент chart'а.
    """
    from datetime import datetime

    def _parse(d: str | None) -> datetime | None:
        if not d:
            return None
        try:
            return datetime.fromisoformat(d)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"invalid date '{d}'") from exc

    dt_from = _parse(date_from)
    dt_to = _parse(date_to)

    company_filter = [Company.niche == niche]
    if city is not None:
        company_filter.append(Company.city == city)

    review_window = [Review.posted_at.isnot(None)]
    if source:
        review_window.append(Review.source == source)
    if dt_from is not None:
        review_window.append(Review.posted_at >= dt_from)
    if dt_to is not None:
        review_window.append(Review.posted_at <= dt_to)

    base = (
        select(
            sa_func.to_char(sa_func.date_trunc("month", Review.posted_at), "YYYY-MM").label("month"),
            Review.source.label("source"),
            sa_func.count(Review.id).label("count"),
        )
        .join(Company, Company.id == Review.company_id)
        .where(*review_window, *company_filter)
        .group_by("month", Review.source)
        .order_by("month")
    )
    rows = list((await db.execute(base)).all())
    points = [
        {"month": r[0], "source": r[1], "count": int(r[2])}
        for r in rows
    ]
    range_start = points[0]["month"] if points else None
    range_end = points[-1]["month"] if points else None

    bounds_filters = [*company_filter, *review_window]
    bounds_row = (
        await db.execute(
            select(
                sa_func.min(Review.posted_at),
                sa_func.max(Review.posted_at),
                sa_func.count(Review.id),
                sa_func.count(sa_func.distinct(Review.company_id)),
            )
            .join(Company, Company.id == Review.company_id)
            .where(*bounds_filters)
        )
    ).one()
    first_at, last_at, total, companies_affected = bounds_row
    return {
        "niche": niche,
        "city": city,
        "pain_tag_id": None,
        "source_filter": source,
        "first_review_at": first_at.isoformat() if first_at else None,
        "last_review_at": last_at.isoformat() if last_at else None,
        "total_reviews": int(total or 0),
        "companies_affected": int(companies_affected or 0),
        "range_start": range_start,
        "range_end": range_end,
        "points": points,
    }


@router.get("/insights/niches")
@limiter.limit("30/minute")
async def list_insights_niches(
    request: Request,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """§4 ТЗ 2026-06-10: список ниш с количеством компаний — для селектора
    на странице demand-index. Сортировка по убыванию выборки."""
    rows = (
        await db.execute(
            select(
                Company.niche,
                sa_func.count(Company.id).label("companies_count"),
            )
            .where(Company.niche.isnot(None), Company.niche != "")
            .group_by(Company.niche)
            .order_by(sa_func.count(Company.id).desc())
            .limit(200)
        )
    ).all()
    return [
        {"niche": r[0], "companies_count": int(r[1])}
        for r in rows
        if r[0]
    ]


@router.get("/insights/demand-index")
@limiter.limit("30/minute")
async def get_demand_index(
    request: Request,
    niche: str = Query(..., min_length=1),
    city: Optional[str] = Query(default=None),
    # 2026-06-16: sentiment toggle. Default 'negative' = старое поведение
    # «Сравнение с нишей: боли клиентов». 'positive' = «Сравнение с нишей:
    # сильные стороны / что хвалят».
    sentiment: str = Query(default="negative", regex="^(negative|positive)$"),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """§4 ТЗ 2026-06-10: индекс спроса по нише+городу.

    Агрегат CompanyPainScore: для каждого active pain_tag доля компаний,
    у которых эта боль упоминается, + суммарное mention_count. Сортировка
    по числу упоминаний.

    Размер выборки (companies_total, with_pain_scores) показывается явно —
    юзер видит честно «по 73 компаниям» вместо подвешенной статистики
    на малых данных. Если выборка <5 компаний — возвращаем пустой items
    с note='small_sample'.

    Без auth — endpoint планируется как публичный контент-магнит (SEO).
    Кэш — не делаем здесь, для тяжёлых ниш ставится либо Redis cache,
    либо Celery+materialized view как cron-job (отдельный PR).
    """
    from app.models.pain_tag import CompanyPainScore, PainTag

    companies_q = select(sa_func.count(Company.id)).where(Company.niche == niche)
    if city is not None:
        companies_q = companies_q.where(Company.city == city)
    companies_total = int((await db.execute(companies_q)).scalar_one() or 0)

    if companies_total < 5:
        return {
            "niche": niche,
            "city": city,
            "companies_total": companies_total,
            "items": [],
            "note": "small_sample",
            "hint": "Слишком маленькая выборка (<5 компаний) — статистика недостоверна. Дождись больше парсингов в этой нише и городе.",
        }

    # Агрегат по pain_tag: суммарные упоминания + сколько компаний затронуто.
    pain_rows = (
        await db.execute(
            select(
                PainTag.id,
                PainTag.label,
                PainTag.description,
                sa_func.coalesce(
                    select(sa_func.sum(CompanyPainScore.mention_count))
                    .join(Company, Company.id == CompanyPainScore.company_id)
                    .where(
                        CompanyPainScore.pain_tag_id == PainTag.id,
                        Company.niche == niche,
                        *([Company.city == city] if city is not None else []),
                    )
                    .correlate(PainTag)
                    .scalar_subquery(),
                    0,
                ).label("total_mentions"),
                sa_func.coalesce(
                    select(sa_func.count(sa_func.distinct(CompanyPainScore.company_id)))
                    .join(Company, Company.id == CompanyPainScore.company_id)
                    .where(
                        CompanyPainScore.pain_tag_id == PainTag.id,
                        CompanyPainScore.mention_count > 0,
                        Company.niche == niche,
                        *([Company.city == city] if city is not None else []),
                    )
                    .correlate(PainTag)
                    .scalar_subquery(),
                    0,
                ).label("companies_affected"),
            )
            .where(
                PainTag.niche == niche,
                PainTag.status == "active",
                PainTag.sentiment == sentiment,
                ((PainTag.city == city) | (PainTag.city.is_(None)))
                if city is not None
                else PainTag.city.is_(None),
            )
        )
    ).all()

    items = []
    for tag_id, label, description, total_mentions, companies_affected in pain_rows:
        tm = int(total_mentions or 0)
        ca = int(companies_affected or 0)
        if tm == 0 and ca == 0:
            continue
        share_of_companies = ca / companies_total if companies_total > 0 else 0.0
        # niche_avg_per_company — то же, что в /pain-benchmark, но без привязки
        # к компании. Используется в шапке выдачи как baseline «среднее по нише».
        niche_avg = tm / companies_total if companies_total > 0 else 0.0
        items.append({
            "pain_tag_id": int(tag_id),
            "label": label,
            "description": description,
            "total_mentions": tm,
            "companies_affected": ca,
            "share_of_companies": round(share_of_companies, 3),
            "niche_avg_per_company": round(niche_avg, 2),
        })

    items.sort(key=lambda x: (-x["total_mentions"], -x["companies_affected"]))

    return {
        "niche": niche,
        "city": city,
        "companies_total": companies_total,
        "items": items[:30],
        "note": "ok",
        "hint": None,
    }


@router.get("/companies/{company_id}/negative-trend")
@limiter.limit("60/minute")
async def get_company_negative_trend(
    request: Request,
    company_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """§3 ТЗ 2026-06-10: «у кого негатив растёт — горячий лид сейчас».

    Возвращает count негативных/нейтральных отзывов за последние 30, 60, 90
    дней + verdict тренда (rising / stable / falling / no_data).

    Логика:
      - rising  — last30 >= 3 И last30 > prev30 * 1.5
      - falling — last30 < prev30 * 0.5 И prev30 >= 3
      - stable  — иначе если есть хоть какие-то данные
      - no_data — если < 3 негативных за 90 дней

    Используется в drawer-блоке «Тренд негатива» как сильный сигнал
    «писать сейчас, проблема свежая».
    """
    from datetime import datetime as _dt, timedelta as _td, timezone as _tz
    await _get_company_or_404(db, company_id)
    now = _dt.now(_tz.utc)

    async def count_neg(since: _dt, until: _dt | None) -> int:
        q = select(sa_func.count(Review.id)).where(
            Review.company_id == company_id,
            Review.posted_at >= since,
            or_(Review.sentiment.in_(["negative", "neutral"]),
                and_(Review.sentiment.is_(None), Review.rating <= 3)),
        )
        if until is not None:
            q = q.where(Review.posted_at < until)
        return int((await db.execute(q)).scalar_one() or 0)

    last30 = await count_neg(now - _td(days=30), None)
    prev30 = await count_neg(now - _td(days=60), now - _td(days=30))
    prev60 = await count_neg(now - _td(days=90), now - _td(days=60))
    total90 = last30 + prev30 + prev60

    if total90 < 3:
        verdict = "no_data"
    elif last30 >= 3 and last30 > prev30 * 1.5:
        verdict = "rising"
    elif prev30 >= 3 and last30 < prev30 * 0.5:
        verdict = "falling"
    else:
        verdict = "stable"

    return {
        "company_id": company_id,
        "last_30d": last30,
        "prev_30d": prev30,
        "prev_60d": prev60,
        "verdict": verdict,
    }


@router.get("/companies/{company_id}/pain-benchmark")
@limiter.limit("30/minute")
async def get_company_pain_benchmark(
    request: Request,
    company_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """§1 ТЗ 2026-06-10: сравнение профиля болей компании со средним по нише+городу.

    Для каждого активного pain_tag этой ниши/города возвращает:
      - company_mentions      — упоминания у ЭТОЙ компании
      - niche_avg_per_company — среднее на компанию по нише
      - ratio                 — company_mentions / max(0.25, niche_avg)
      - verdict               — worse (>= 1.5×) / on_par / better (< 0.66×)
      - niche_total_mentions  — суммарно по нише
      - niche_companies_total — размер выборки (для честности UI)

    Используется в drawer-блоке «Сравнение с нишей» — аргумент в письме лиду
    и сигнал для платных отчётов в дальнейшем. Все агрегаты по уже
    собранным CompanyPainScore — без нового парсинга.
    """
    company = await _get_company_or_404(db, company_id)
    if not company.niche:
        return {
            "company_id": company_id,
            "niche": None,
            "city": None,
            "niche_companies_total": 0,
            "items": [],
        }

    from app.models.pain_tag import CompanyPainScore, PainTag

    # Кол-во компаний этой ниши+города (для расчёта среднего на компанию).
    siblings_q = select(sa_func.count(Company.id)).where(Company.niche == company.niche)
    if company.city is not None:
        siblings_q = siblings_q.where(Company.city == company.city)
    niche_companies_total = int((await db.execute(siblings_q)).scalar_one() or 0)
    if niche_companies_total == 0:
        return {
            "company_id": company_id,
            "niche": company.niche,
            "city": company.city,
            "niche_companies_total": 0,
            "items": [],
        }

    # Одна CTE-выборка: pain_tags ниши + сумма по нише + значение этой компании.
    # niche_avg рассчитываем в Python (делим на niche_companies_total) —
    # внутри SQL потребовался бы CROSS JOIN на скаляр, не выигрывает в clarity.
    pain_rows = (
        await db.execute(
            select(
                PainTag.id,
                PainTag.label,
                PainTag.description,
                sa_func.coalesce(
                    select(CompanyPainScore.mention_count)
                    .where(
                        CompanyPainScore.company_id == company_id,
                        CompanyPainScore.pain_tag_id == PainTag.id,
                    )
                    .correlate(PainTag)
                    .scalar_subquery(),
                    0,
                ).label("company_mentions"),
                sa_func.coalesce(
                    select(sa_func.sum(CompanyPainScore.mention_count))
                    .join(Company, Company.id == CompanyPainScore.company_id)
                    .where(
                        CompanyPainScore.pain_tag_id == PainTag.id,
                        Company.niche == company.niche,
                        *([Company.city == company.city] if company.city is not None else []),
                    )
                    .correlate(PainTag)
                    .scalar_subquery(),
                    0,
                ).label("niche_total_mentions"),
            )
            .where(
                PainTag.niche == company.niche,
                PainTag.status == "active",
                # включаем и city-specific, и global (city=NULL).
                ((PainTag.city == company.city) | (PainTag.city.is_(None)))
                if company.city is not None
                else PainTag.city.is_(None),
            )
        )
    ).all()

    items = []
    for tag_id, label, description, company_mentions, niche_total in pain_rows:
        comp_m = int(company_mentions or 0)
        nt_m = int(niche_total or 0)
        if comp_m == 0 and nt_m == 0:
            continue
        niche_avg = nt_m / niche_companies_total if niche_companies_total > 0 else 0.0
        # Защита от деления на «ноль из-за маленькой ниши»: avg<0.25 трактуем
        # как 0.25, иначе любая компания с 1 жалобой выглядит «в 10 раз хуже».
        denom = max(0.25, niche_avg)
        ratio = comp_m / denom
        if ratio >= 1.5:
            verdict = "worse"
        elif ratio <= 0.66:
            verdict = "better"
        else:
            verdict = "on_par"
        items.append({
            "pain_tag_id": int(tag_id),
            "label": label,
            "description": description,
            "company_mentions": comp_m,
            "niche_total_mentions": nt_m,
            "niche_avg_per_company": round(niche_avg, 2),
            "ratio": round(ratio, 2),
            "verdict": verdict,
        })

    # Сортировка: сначала «хуже рынка» по убыванию ratio, потом on_par, потом better.
    verdict_order = {"worse": 0, "on_par": 1, "better": 2}
    items.sort(key=lambda x: (verdict_order[x["verdict"]], -x["ratio"]))

    return {
        "company_id": company_id,
        "niche": company.niche,
        "city": company.city,
        "niche_companies_total": niche_companies_total,
        "items": items[:20],
    }


# ---------------------------------------------------------------------------
# Company digest (агрегат отзывов за период)
# ---------------------------------------------------------------------------


@router.get("/companies/{company_id}/digest", response_model=CompanyDigestOut)
@limiter.limit("60/minute")
async def get_company_digest(
    request: Request,
    company_id: int,
    days: int = Query(
        default=30,
        ge=0,
        le=3650,
        description="Окно в днях. 0 = за всё время (фильтр по posted_at снимается).",
    ),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Сводка отзывов компании за N дней: счёт по sentiment, средний рейтинг,
    доля ответов владельца, топ-боли с цитатами.

    Используется в drawer'е компании, чтобы юзер одним взглядом понял
    «как сейчас себя чувствует» эта компания — нужно ли её включать в outreach,
    стоит ли использовать конкретную боль в письме.

    Юзер может переключать окно (30/90/180/365/all) — последний пункт
    шлёт days=0 и в этом случае мы не фильтруем по posted_at.

    Отдельно от агрегатов отдаём top_negative_reviews_all_time —
    топ-3 самых ярких негативных отзыва за всё время (по rating asc +
    sentiment_score asc). Не зависит от `days`, чтобы у компаний без
    свежих отзывов превью цитат всё равно появилось.
    """
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td

    company = await _get_company_or_404(db, company_id)

    all_time = days == 0
    date_filter = []
    if not all_time:
        since = _dt.now(_tz.utc) - _td(days=days)
        date_filter = [Review.posted_at >= since]

    # Агрегаты по sentiment / rating / owner_reply одним запросом.
    # ВАЖНО: case() — это standalone-функция SQLAlchemy 2.0, импортируется из
    # sqlalchemy напрямую. func.case(...) не работает (Function.__init__ не
    # принимает else_ kwarg) — старый код падал с TypeError на каждом запросе
    # к /maps/companies/{id}/digest.
    aggregate_row = (await db.execute(
        select(
            sa_func.count(Review.id),
            sa_func.sum(sa_case((Review.sentiment == "positive", 1), else_=0)),
            sa_func.sum(sa_case((Review.sentiment == "negative", 1), else_=0)),
            sa_func.sum(sa_case((Review.sentiment == "neutral", 1), else_=0)),
            sa_func.avg(Review.rating),
            sa_func.sum(sa_case((Review.has_owner_reply.is_(True), 1), else_=0)),
        )
        .where(Review.company_id == company_id, *date_filter)
    )).one()
    total, pos, neg, neu, avg_r, owner_r = aggregate_row

    total_int = int(total or 0)
    owner_rate = (float(owner_r or 0) / total_int) if total_int else None

    pains_map = await service.get_top_pains_for_companies(db, [company_id], limit_per_company=5)
    pains = [CompanyPainOut(**p) for p in pains_map.get(company_id, [])]

    # Топ-3 негатива за всё время. Берём sentiment='negative' или
    # (sentiment IS NULL AND rating <= 3) — чтобы у компаний, где AI
    # ещё не размечал отзывы, тоже находить негатив по рейтингу.
    # raw_text != NULL — без текста смысла нет показывать. Сортировка:
    # rating asc (1★ выше 3★), sentiment_score asc (более негативные
    # первыми), длина текста desc (предпочитаем содержательные).
    negatives_rows = (await db.execute(
        select(Review)
        .where(
            Review.company_id == company_id,
            Review.raw_text.isnot(None),
            sa_func.length(sa_func.coalesce(Review.raw_text, "")) > 0,
            or_(
                Review.sentiment == "negative",
                and_(Review.sentiment.is_(None), Review.rating <= 3),
            ),
        )
        .order_by(
            Review.rating.asc().nullslast(),
            Review.sentiment_score.asc().nullslast(),
            sa_func.length(Review.raw_text).desc(),
            Review.posted_at.desc().nullslast(),
        )
        .limit(3)
    )).scalars().all()
    top_negatives = [ReviewOut.model_validate(r) for r in negatives_rows]

    return CompanyDigestOut(
        company_id=company.id,
        days=None if all_time else days,
        total_reviews=total_int,
        positive_count=int(pos or 0),
        negative_count=int(neg or 0),
        neutral_count=int(neu or 0),
        avg_rating=float(avg_r) if avg_r is not None else None,
        owner_reply_rate=owner_rate,
        top_pains=pains,
        top_negative_reviews_all_time=top_negatives,
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
# Admin: discover websites by handle (roadmap 2026-06-02)
# ---------------------------------------------------------------------------


@router.post("/admin/discover-websites")
@limiter.limit("5/minute")
async def admin_discover_websites(
    request: Request,
    search_id: int | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=5000),
    _: "User" = Depends(require_superuser),
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
    _: "User" = Depends(require_superuser),
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
    _: "User" = Depends(require_superuser),
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
# Admin: bulk re-enrich ЛПР со страниц сайта (после PR #15 / миграции 032)
# ---------------------------------------------------------------------------


# Обычный user-доступный endpoint для bulk-обогащения ЛПР по списку
# конкретных компаний. Принимает выбранные id из UI bulk-toolbar выдачи.
# Идемпотентно (skip уже обогащённых) + проверяет владение поиском.

@router.post("/companies/enrich-team")
@limiter.limit("10/minute")
async def companies_enrich_team(
    request: Request,
    payload: dict,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Ставит Celery-таски enrich_company_team для списка company_ids.

    Body: {"company_ids": [1, 2, 3], "search_id": 42}
    search_id — обязателен для проверки владения; user не может обогатить
    компании из чужого поиска (даже если знает их id).

    Идемпотентно: пропускает компании без website + те, у кого ЛПР уже есть.
    Возвращает {"queued": N, "skipped_no_website": M, "skipped_already_has_lpr": K}.
    """
    from app.models.company_decision_maker import CompanyDecisionMaker
    from app.models.maps import MapSearchResult
    from app.modules.maps.tasks import enrich_company_team

    company_ids = payload.get("company_ids") or []
    search_id = payload.get("search_id")
    if not isinstance(company_ids, list) or not company_ids:
        raise HTTPException(status_code=400, detail="company_ids обязателен")
    if search_id is None:
        raise HTTPException(status_code=400, detail="search_id обязателен")
    company_ids = [int(x) for x in company_ids if isinstance(x, (int, str))][:500]

    await _get_owned_search(db, int(search_id), user_id)

    # Проверка что все id привязаны к этому search_id — защита от подмены.
    valid_rows = (await db.execute(
        select(MapSearchResult.company_id)
        .where(MapSearchResult.map_search_id == int(search_id))
        .where(MapSearchResult.company_id.in_(company_ids))
    )).scalars().all()
    valid_set = {int(x) for x in valid_rows}
    if not valid_set:
        return {"queued": 0, "skipped_no_website": 0, "skipped_already_has_lpr": 0}

    # Уже обогащённые (есть запись в company_decision_makers).
    already_dms = (await db.execute(
        select(CompanyDecisionMaker.company_id).where(
            CompanyDecisionMaker.company_id.in_(valid_set)
        ).distinct()
    )).scalars().all()
    already_set = {int(x) for x in already_dms}

    # Компании этой выборки + их website (для фильтрации no_website).
    websites = (await db.execute(
        select(Company.id, Company.website).where(Company.id.in_(valid_set))
    )).all()
    web_map = {int(r[0]): (r[1] or "").strip() for r in websites}

    queued = 0
    skipped_no_website = 0
    skipped_already = 0
    for cid in valid_set:
        if cid in already_set:
            skipped_already += 1
            continue
        if not web_map.get(cid):
            skipped_no_website += 1
            continue
        try:
            enrich_company_team.delay(int(cid))
            queued += 1
        except Exception as e:
            logger.warning("companies_enrich_team enqueue failed for #%s: %s", cid, e)
    return {
        "queued": queued,
        "skipped_no_website": skipped_no_website,
        "skipped_already_has_lpr": skipped_already,
    }


@router.post("/admin/bulk-enrich-team")
@limiter.limit("5/minute")
async def admin_bulk_enrich_team(
    request: Request,
    search_id: int | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=2000),
    _: "User" = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Ставит Celery-таски enrich_company_team для компаний с website,
    у которых ещё нет извлечённых ЛПР (нет записи в company_decision_makers).

    Идемпотентно: повторный вызов пропустит компании, у которых ЛПР уже
    есть. enrich_company_team сам ходит на /team /о-нас /контакты и
    LLM-извлекает ФИО (rate-limit 30/m, ProxyAPI).
    """
    from app.models.company_decision_maker import CompanyDecisionMaker
    from app.modules.maps.tasks import enrich_company_team

    sub = select(CompanyDecisionMaker.company_id)
    stmt = (
        select(Company.id)
        .where(Company.website.isnot(None))
        .where(Company.website != "")
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
            enrich_company_team.delay(int(cid))
            queued += 1
        except Exception as e:
            logger.warning("bulk-enrich-team enqueue failed for #%s: %s", cid, e)
    return {"queued": queued}


@router.post("/admin/bulk-enrich-website-email-playwright")
@limiter.limit("5/minute")
async def admin_bulk_enrich_website_email_playwright(
    request: Request,
    search_id: int | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    _: "User" = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Прогоняет playwright-парсер по компаниям с website и без emails.
    Тяжёлый (~3с/компания), лимит по умолчанию 100.

    Идемпотентно: пропускает компании с уже проставленной отметкой
    contacts_extra.playwright_website_at.
    """
    from sqlalchemy import and_, func
    from app.modules.maps.tasks import enrich_website_email_playwright

    stmt = (
        select(Company.id)
        .where(func.btrim(func.coalesce(Company.website, "")) != "")
        .where(
            # emails IS NULL или пустой массив
            (Company.emails.is_(None))
            | (func.cardinality(Company.emails) == 0)
        )
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
            enrich_website_email_playwright.delay(int(cid))
            queued += 1
        except Exception as e:
            logger.warning(
                "admin_bulk_website_email_playwright enqueue for #%s: %s", cid, e,
            )
    return {"queued": queued}


@router.post("/admin/bulk-enrich-marketing-dm")
@limiter.limit("5/minute")
async def admin_bulk_enrich_marketing_dm(
    request: Request,
    search_id: int | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=2000),
    _: "User" = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Прогоняет пайплайн «Маркетинг-ЛПР Finder» по существующим компаниям.

    Идемпотентно: если оркестратор уже отработал по компании (есть запись
    с is_marketing_dm=True), — пропускаем. Иначе ставим hh+vk+оркестратор.

    Для разового прогона на проде: после мержа фичи хочется получить
    hiring_marketing и маркетинг-ЛПР по компаниям, которые парсились
    ДО этой ветки. Без bulk-endpoint пришлось бы ждать нового парсинга.
    """
    from app.models.company_decision_maker import CompanyDecisionMaker
    from app.modules.maps.tasks import (
        enrich_company_hh,
        enrich_company_vk,
        enrich_marketing_dm as enrich_marketing_dm_task,
    )
    from app.core.config import settings as _s

    # Компании, у которых уже выставлен is_marketing_dm — пропускаем.
    already_sub = select(CompanyDecisionMaker.company_id).where(
        CompanyDecisionMaker.is_marketing_dm.is_(True)
    )
    stmt = (
        select(Company.id)
        .where(Company.id.not_in(already_sub))
        .limit(limit)
    )
    if search_id is not None:
        from app.models.maps import MapSearchResult
        stmt = stmt.join(
            MapSearchResult, MapSearchResult.company_id == Company.id
        ).where(MapSearchResult.map_search_id == search_id)

    rows = (await db.execute(stmt)).scalars().all()
    vk_enabled = bool((_s.VK_SERVICE_TOKEN or "").strip())
    queued = 0
    for cid in rows:
        try:
            enrich_company_hh.delay(int(cid))
            if vk_enabled:
                enrich_company_vk.delay(int(cid))
            enrich_marketing_dm_task.apply_async(args=[int(cid)], countdown=45)
            queued += 1
        except Exception as e:
            logger.warning(
                "admin_bulk_enrich_marketing_dm enqueue failed for #%s: %s",
                cid, e,
            )
    return {"queued": queued, "vk_enabled": vk_enabled}


@router.post("/companies/enrich-marketing-dm")
@limiter.limit("10/minute")
async def companies_enrich_marketing_dm(
    request: Request,
    payload: dict,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """ТЗ «Маркетинг-ЛПР Finder» 2026-06-20: полный пайплайн поиска маркетинг-ЛПР
    для списка компаний. Ставит hh + vk + оркестратор.

    Body: {"company_ids": [1, 2, 3], "search_id": 42}
    Идемпотентно: оркестратор внутри reset'ит прошлый is_marketing_dm.
    """
    from app.models.maps import MapSearchResult
    from app.modules.maps.tasks import (
        enrich_company_hh,
        enrich_company_vk,
        enrich_marketing_dm as enrich_marketing_dm_task,
    )
    from app.core.config import settings as _s

    company_ids = payload.get("company_ids") or []
    search_id = payload.get("search_id")
    if not isinstance(company_ids, list) or not company_ids:
        raise HTTPException(status_code=400, detail="company_ids обязателен")
    if search_id is None:
        raise HTTPException(status_code=400, detail="search_id обязателен")
    company_ids = [int(x) for x in company_ids if isinstance(x, (int, str))][:500]

    await _get_owned_search(db, int(search_id), user_id)

    valid_rows = (await db.execute(
        select(MapSearchResult.company_id)
        .where(MapSearchResult.map_search_id == int(search_id))
        .where(MapSearchResult.company_id.in_(company_ids))
    )).scalars().all()
    valid_set = {int(x) for x in valid_rows}
    if not valid_set:
        return {"queued": 0}

    vk_enabled = bool((_s.VK_SERVICE_TOKEN or "").strip())
    queued = 0
    for cid in valid_set:
        try:
            enrich_company_hh.delay(int(cid))
            if vk_enabled:
                enrich_company_vk.delay(int(cid))
            enrich_marketing_dm_task.apply_async(args=[int(cid)], countdown=45)
            queued += 1
        except Exception as e:
            logger.warning(
                "companies_enrich_marketing_dm enqueue failed for #%s: %s",
                cid, e,
            )
    return {"queued": queued, "vk_enabled": vk_enabled}


# ---------------------------------------------------------------------------
# Point-source enrich (2026-07-11): юзер в drawer'е кликает по плашке
# «Проверено: ○ ВК» — запускается ТОЛЬКО парсер ВК для этой компании.
# Существующий /companies/enrich-marketing-dm гоняет весь оркестратор,
# что тратит квоты (DaData/SerpAPI) впустую если нужна лишь 1 источник.
# ---------------------------------------------------------------------------


_ENRICH_SOURCE_TASKS = {
    # source-key → (task-import-attr, human-label). Все таски принимают
    # ровно один аргумент — company_id, и уже сами разбираются с квотами
    # / no-op'ами / ретраями. Здесь только диспетч.
    "website": ("enrich_company_team", "сайт (страницы «команда/о нас»)"),
    "vk": ("enrich_company_vk", "ВКонтакте"),
    "hh": ("enrich_company_hh", "hh.ru"),
    "egrul": ("enrich_company_legal", "ЕГРЮЛ / DaData"),
}


@router.post("/companies/{company_id}/enrich-source")
@limiter.limit("20/minute")
async def companies_enrich_single_source(
    company_id: int,
    request: Request,
    payload: dict,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Триггерит ОДИН конкретный источник для компании (2026-07-11).

    Body: {"source": "website"|"vk"|"hh"|"egrul", "search_id": 42}
    - source: какой парсер запустить (валидируется по _ENRICH_SOURCE_TASKS).
    - search_id: обязателен для own-check (юзер не должен обогащать
      компании из чужого поиска, даже зная id).

    После постановки source-таска ставим enrich_marketing_dm через 45с —
    чтобы найденные новые контакты попали в marketing-DM selection.

    Возвращает: {"queued": true, "source": "vk", "task": "enrich_company_vk"}
    либо 400/404/503 с понятным detail.
    """
    from app.models.maps import MapSearchResult
    from app.modules.maps.tasks import enrich_marketing_dm as enrich_marketing_dm_task

    source = str(payload.get("source") or "").strip().lower()
    if source not in _ENRICH_SOURCE_TASKS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"source должен быть один из: {', '.join(sorted(_ENRICH_SOURCE_TASKS))}"
            ),
        )
    search_id = payload.get("search_id")
    if search_id is None:
        raise HTTPException(status_code=400, detail="search_id обязателен")

    await _get_owned_search(db, int(search_id), user_id)

    # Компания должна быть в этом search'е (защита от подмены id).
    exists = (
        await db.execute(
            select(MapSearchResult.company_id)
            .where(MapSearchResult.map_search_id == int(search_id))
            .where(MapSearchResult.company_id == int(company_id))
            .limit(1)
        )
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(
            status_code=404, detail="Компания не найдена в этом поиске."
        )

    task_attr, label = _ENRICH_SOURCE_TASKS[source]
    from app.modules.maps import tasks as _tasks_mod

    task_fn = getattr(_tasks_mod, task_attr, None)
    if task_fn is None:
        # Технически защита от опечатки в _ENRICH_SOURCE_TASKS
        raise HTTPException(
            status_code=503,
            detail=f"Внутренняя ошибка: таск {task_attr} не найден.",
        )

    try:
        task_fn.delay(int(company_id))
        # Re-select marketing-DM после того как source отработает.
        enrich_marketing_dm_task.apply_async(args=[int(company_id)], countdown=45)
    except Exception as e:
        logger.warning(
            "companies_enrich_single_source enqueue failed (source=%s, cid=%s): %s",
            source, company_id, e,
        )
        raise HTTPException(
            status_code=503,
            detail=f"Celery недоступен, не удалось запустить {label}.",
        )

    return {"queued": True, "source": source, "task": task_attr, "label": label}


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
    _: "User" = Depends(require_superuser),
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


@router.post("/admin/recluster-niche")
@limiter.limit("5/minute")
async def admin_recluster_niche(
    request: Request,
    search_id: int = Query(...),
    sentiment: str = Query(
        "negative",
        regex="^(negative|positive)$",
        description="negative = боли, positive = сильные стороны",
    ),
    _: "User" = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Ручной триггер AI-разбора болей/сильных сторон для ниши/города поиска.

    Зачем: cron `recluster_popular_niches` запускает recluster раз в сутки
    только для top-30 (niche, city) по reviews. Для редких или свежих
    комбинаций (типа «стоматология / Балашиха») это значит что
    `company_pain_scores` навсегда пуст → карточки показывают «ЖАЛОБЫ
    КЛИЕНТОВ» (snippet-fallback) вместо красивых pain-pills с лейблами.

    Этот endpoint дёргает `recluster_pains_for_niche_task` для конкретной
    ниши/города поиска. После завершения (1-3 мин) `top_pains` у всех
    компаний этой ниши заполнится и UI покажет pain-tags.

    sentiment='positive' (2026-06-18): аналогично для сильных сторон —
    отдельный набор LLM-кластеров с STRENGTH_NAMING_PROMPT. UI toggle
    «Боли / Сильные стороны» (миграция 035) подтянет нужный набор
    автоматически. positive-теги хранятся отдельно от negative и не
    конфликтуют по UNIQUE (расширенный констрейнт включает sentiment).
    """
    search = await _get_owned_search(db, search_id, user_id)
    if not search.niche or not search.city:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="У поиска не указана ниша или город — recluster невозможен.",
        )

    # Полная цепочка: analyze_reviews_for_company (sentiment + embeddings) для
    # КАЖДОЙ компании поиска, потом через 120с recluster_pains_for_niche.
    # Раньше дёргали только recluster — но если у отзывов не было embeddings
    # (analyze ещё не отрабатывал), recluster тихо возвращал 0 и плитки
    # никогда не появлялись. Теперь сначала готовим данные, потом кластеризуем.
    from app.models.maps import MapSearchResult
    company_ids_rows = (
        await db.execute(
            select(MapSearchResult.company_id).where(
                MapSearchResult.map_search_id == search.id
            )
        )
    ).scalars().all()
    company_ids = [int(c) for c in company_ids_rows]

    try:
        from app.modules.reviews_ai.tasks import (
            analyze_reviews_for_company,
            recluster_pains_for_niche_task,
        )
        for cid in company_ids:
            analyze_reviews_for_company.delay(cid)
        # Передаём company_ids явно — у Company.niche в БД формулировка из
        # источника (2GIS отдаёт «Стоматологические клиники») может не
        # совпадать с search.niche («стоматология»), и фильтр recluster
        # по niche тогда давал 0 отзывов → теги не создавались, UI вис на 70%.
        #
        # countdown: если все отзывы уже с embedding (cache hit / прошлый
        # запуск analyze) — recluster через 5 секунд. Иначе даём 60 сек
        # чтобы первые analyze-таски посчитали хотя бы базу embeddings.
        # Раньше countdown=120 ждал даже когда работать уже было можно.
        all_reviews = (
            await db.execute(
                select(sa_func.count(Review.id)).where(
                    Review.company_id.in_(company_ids) if company_ids else False,
                )
            )
        ).scalar() or 0
        with_emb = (
            await db.execute(
                select(sa_func.count(Review.id)).where(
                    Review.company_id.in_(company_ids) if company_ids else False,
                    Review.embedding.is_not(None),
                )
            )
        ).scalar() or 0
        countdown_sec = 5 if all_reviews > 0 and with_emb >= all_reviews else 60
        recluster_pains_for_niche_task.apply_async(
            kwargs={
                "niche": search.niche,
                "city": search.city,
                "company_ids": company_ids,
                "sentiment": sentiment,
            },
            countdown=countdown_sec,
        )
    except Exception as e:
        logger.exception("admin_recluster_niche: failed to enqueue")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Не смог поставить задачу: {e}",
        )

    return {
        "queued": True,
        "niche": search.niche,
        "city": search.city,
        "sentiment": sentiment,
        "companies_queued_for_analyze": len(company_ids),
        "hint": (
            f"Запущено: sentiment + embeddings, затем через {countdown_sec}с — "
            f"кластеризация {'сильных сторон' if sentiment == 'positive' else 'болей'}. "
            f"Общее время ~{2 if countdown_sec < 30 else 4} минуты."
        ),
    }


@router.get("/admin/data-inventory")
@limiter.limit("10/minute")
async def admin_data_inventory(
    request: Request,
    _: "User" = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Инвентаризация распарсенных данных: (niche, city) → counts.

    Возвращает срез что вообще есть в БД:
      - companies_count: сколько компаний
      - reviews_count: сколько отзывов накоплено (сумма Company.reviews_count)
      - reviews_analyzed: сколько отзывов прошли sentiment/embeddings
      - pain_tags_count: сколько активных PainTag построено
      - has_pain_scores: есть ли CompanyPainScore для этой пары

    Ниши/города, у которых нет ни отзывов ни компаний, не включаем.
    Сортировка: по companies_count desc. Полезно чтобы юзер видел
    что у него реально есть для работы и где дыры.
    """
    from app.models.pain_tag import CompanyPainScore

    # companies: сгруппировано по (niche, city)
    company_stats = list((await db.execute(
        select(
            Company.niche,
            Company.city,
            sa_func.count(Company.id).label("companies"),
            sa_func.coalesce(sa_func.sum(Company.reviews_count), 0).label("reviews"),
        )
        .where(Company.niche.isnot(None), Company.city.isnot(None))
        .group_by(Company.niche, Company.city)
    )).all())

    # pain_tags: активные негативные, сгруппировано по (niche, city)
    tag_stats = list((await db.execute(
        select(
            PainTag.niche,
            PainTag.city,
            sa_func.count(PainTag.id).label("tags"),
        )
        .where(PainTag.status == "active", PainTag.sentiment == "negative")
        .group_by(PainTag.niche, PainTag.city)
    )).all())

    # analyzed reviews: считаем reviews с embedding по (Company.niche, Company.city)
    analyzed_stats = list((await db.execute(
        select(
            Company.niche,
            Company.city,
            sa_func.count(Review.id).label("analyzed"),
        )
        .join(Review, Review.company_id == Company.id)
        .where(
            Company.niche.isnot(None),
            Company.city.isnot(None),
            Review.embedding.isnot(None),
        )
        .group_by(Company.niche, Company.city)
    )).all())

    # has_pain_scores: True если есть хоть один CompanyPainScore
    scored_stats = list((await db.execute(
        select(
            Company.niche,
            Company.city,
            sa_func.count(sa_func.distinct(CompanyPainScore.company_id)).label("with_scores"),
        )
        .join(CompanyPainScore, CompanyPainScore.company_id == Company.id)
        .where(Company.niche.isnot(None), Company.city.isnot(None))
        .group_by(Company.niche, Company.city)
    )).all())

    # Строим единый словарь по (niche, city)
    inventory: dict[tuple[str, str], dict] = {}
    for niche_, city_, comp, rev in company_stats:
        key = (str(niche_), str(city_))
        inventory[key] = {
            "niche": str(niche_),
            "city": str(city_),
            "companies_count": int(comp or 0),
            "reviews_count": int(rev or 0),
            "reviews_analyzed": 0,
            "pain_tags_count": 0,
            "companies_with_pain_scores": 0,
        }

    for niche_, city_, analyzed in analyzed_stats:
        key = (str(niche_), str(city_ or ""))
        if key in inventory:
            inventory[key]["reviews_analyzed"] = int(analyzed or 0)

    for niche_, city_, tags in tag_stats:
        # PainTag.city может быть NULL (глобальные для ниши) — учитываем в общий счёт
        if city_ is None:
            # Прибавляем ко всем городам этой ниши
            for k, v in inventory.items():
                if k[0] == str(niche_):
                    v["pain_tags_count"] += int(tags or 0)
        else:
            key = (str(niche_), str(city_))
            if key in inventory:
                inventory[key]["pain_tags_count"] += int(tags or 0)

    for niche_, city_, with_scores in scored_stats:
        key = (str(niche_), str(city_))
        if key in inventory:
            inventory[key]["companies_with_pain_scores"] = int(with_scores or 0)

    items = sorted(
        inventory.values(),
        key=lambda x: (-x["companies_count"], x["niche"], x["city"]),
    )

    return {
        "total_pairs": len(items),
        "total_companies": sum(x["companies_count"] for x in items),
        "total_reviews": sum(x["reviews_count"] for x in items),
        "total_pain_tags": sum(x["pain_tags_count"] for x in items),
        "items": items,
    }


@router.post("/admin/rebuild-pain-tags-for-niche")
@limiter.limit("3/minute")
async def admin_rebuild_pain_tags_for_niche(
    request: Request,
    niche: str = Query(..., min_length=2, max_length=100),
    city: str | None = Query(default=None, max_length=100),
    sentiment: str = Query(
        "negative",
        regex="^(negative|positive)$",
        description="negative = боли, positive = сильные стороны",
    ),
    _: "User" = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Перестроить pain_tags для ниши/города по ВСЕМ компаниям в БД.

    Отличие от /admin/recluster-niche: не привязан к search_id, а ищет
    компании по Company.niche + Company.city напрямую. Нужно для случая
    когда pilot bulk-парс сделал N поисков со status='from_cache' — они
    все ссылаются на уже спарсенные компании, но reviews_ai для них
    не пере-запускался (см. fix from_cache в create_map_search).

    Пример: один вызов на «стоматология / Москва» покроет все 12 pilot
    поисков этой ниши/города независимо от того, cache-hit они или нет.

    Пайплайн:
      1. Находим все Company.niche=X, Company.city=Y (если city задан).
      2. Для каждой — analyze_reviews_for_company.delay (идемпотентно).
      3. Через 180с — recluster_pains_for_niche_task для (niche, city).
    """
    filters_ = [Company.niche == niche]
    if city:
        filters_.append(Company.city == city)
    company_ids_rows = (
        await db.execute(select(Company.id).where(*filters_))
    ).scalars().all()
    company_ids = [int(c) for c in company_ids_rows]

    if not company_ids:
        return {
            "queued": False,
            "niche": niche,
            "city": city,
            "companies_queued_for_analyze": 0,
            "hint": (
                f"В БД нет компаний с niche={niche!r}"
                + (f", city={city!r}" if city else "")
                + ". Может niche записан иначе — проверь /maps/niches."
            ),
        }

    try:
        from app.modules.reviews_ai.tasks import (
            analyze_reviews_for_company,
            recluster_pains_for_niche_task,
        )
        for cid in company_ids:
            analyze_reviews_for_company.delay(cid)
        recluster_pains_for_niche_task.apply_async(
            kwargs={
                "niche": niche,
                "city": city,
                "company_ids": company_ids,
                "sentiment": sentiment,
            },
            countdown=180,
        )
    except Exception as e:
        logger.exception("admin_rebuild_pain_tags_for_niche: failed to enqueue")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Не смог поставить задачу: {e}",
        )

    return {
        "queued": True,
        "niche": niche,
        "city": city,
        "sentiment": sentiment,
        "companies_queued_for_analyze": len(company_ids),
        "hint": (
            f"Запущено analyze для {len(company_ids)} компаний, "
            f"через 180с — recluster {'сильных сторон' if sentiment == 'positive' else 'болей'}. "
            "Общее время ~4-6 минут в зависимости от объёма отзывов."
        ),
    }


@router.get("/admin/rebuild-pain-tags-status")
async def admin_rebuild_pain_tags_status(
    niche: str = Query(..., min_length=2, max_length=100),
    city: str | None = Query(default=None, max_length=100),
    _: "User" = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Прогресс AI-разметки болей для (ниша, город). Фронт поллит этот
    endpoint пока идёт recluster, чтобы юзер видел «65 из 168 компаний
    обработано» вместо глухого «подожди 5-8 минут» (юзер 2026-07-14).

    Считаем:
      - companies_total: сколько компаний в БД (ниша+город)
      - reviews_total: сколько отзывов у этих компаний
      - reviews_analyzed: сколько отзывов уже прошло AI (ai_processed_at != NULL)
      - active_tags: сколько активных pain_tags для этой (ниша+город)
      - pain_scores: сколько company_pain_scores для этих компаний

    percent = reviews_analyzed / reviews_total. Когда 100% + прошло
    ~3 мин (countdown recluster_pains_for_niche_task) — плитка готова.
    """
    from app.models.maps import Review
    from app.models.pain_tag import CompanyPainScore, PainTag

    company_filter = [Company.niche == niche]
    if city:
        company_filter.append(Company.city == city)

    companies_total = int(
        (await db.execute(
            select(sa_func.count(Company.id)).where(*company_filter)
        )).scalar_one() or 0
    )

    if companies_total == 0:
        return {
            "niche": niche,
            "city": city,
            "companies_total": 0,
            "reviews_total": 0,
            "reviews_analyzed": 0,
            "percent": 0,
            "active_tags": 0,
            "pain_scores": 0,
            "ready": True,
            "hint": "В БД нет компаний с этой связкой.",
        }

    company_ids_subq = select(Company.id).where(*company_filter).scalar_subquery()

    reviews_total = int(
        (await db.execute(
            select(sa_func.count(Review.id)).where(
                Review.company_id.in_(company_ids_subq)
            )
        )).scalar_one() or 0
    )
    reviews_analyzed = int(
        (await db.execute(
            select(sa_func.count(Review.id)).where(
                Review.company_id.in_(company_ids_subq),
                Review.ai_processed_at.is_not(None),
            )
        )).scalar_one() or 0
    )

    tag_filter = [PainTag.status == "active", PainTag.niche == niche]
    if city:
        tag_filter.append(or_(PainTag.city == city, PainTag.city.is_(None)))
    active_tags = int(
        (await db.execute(select(sa_func.count(PainTag.id)).where(*tag_filter))).scalar_one() or 0
    )

    pain_scores = int(
        (await db.execute(
            select(sa_func.count(CompanyPainScore.id)).where(
                CompanyPainScore.company_id.in_(company_ids_subq)
            )
        )).scalar_one() or 0
    )

    percent = int(reviews_analyzed * 100 / reviews_total) if reviews_total > 0 else 100
    ready = percent >= 100 and pain_scores > 0
    return {
        "niche": niche,
        "city": city,
        "companies_total": companies_total,
        "reviews_total": reviews_total,
        "reviews_analyzed": reviews_analyzed,
        "percent": percent,
        "active_tags": active_tags,
        "pain_scores": pain_scores,
        "ready": ready,
        "hint": (
            f"AI обработал {reviews_analyzed}/{reviews_total} отзывов ({percent}%). "
            + (
                f"Активных тегов: {active_tags}, связей компания↔боль: {pain_scores}."
                if ready
                else "Recluster завершится через ~3 мин после 100%."
            )
        ),
    }


@router.post("/admin/requeue-stale-searches")
@limiter.limit("2/minute")
async def admin_requeue_stale_searches(
    request: Request,
    older_than_minutes: int = Query(default=30, ge=5, le=1440),
    limit: int = Query(default=50, ge=1, le=500),
    _: "User" = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Найти maps-поиски, застрявшие в pending/running > N минут, и
    переставить их в очередь celery.

    Зачем: pilot bulk-парс 13.07 создал 7 pending-поисков. Если celery
    после рестарта потерял часть тасок — поиски навсегда висят в pending,
    UI и /app/pains показывают 0 компаний. Этот endpoint находит стуки
    и рестартует parse_map_search.delay для каждого.

    Возвращает список requeued search_id.
    """
    from datetime import datetime, timezone, timedelta
    from app.models.maps import MapSearch

    threshold = datetime.now(timezone.utc) - timedelta(minutes=older_than_minutes)
    stale = (
        await db.execute(
            select(MapSearch.id, MapSearch.niche, MapSearch.city, MapSearch.status, MapSearch.created_at)
            .where(
                MapSearch.status.in_(["pending", "running"]),
                MapSearch.created_at < threshold,
            )
            .order_by(MapSearch.created_at)
            .limit(limit)
        )
    ).all()

    if not stale:
        return {
            "requeued": 0,
            "older_than_minutes": older_than_minutes,
            "hint": f"Нет поисков в pending/running старше {older_than_minutes} мин.",
        }

    from app.modules.maps.tasks import parse_map_search as parse_task
    requeued_ids: list[int] = []
    for sid, niche, city, status_, _created in stale:
        try:
            parse_task.delay(int(sid))
            requeued_ids.append(int(sid))
            logger.info(
                "admin_requeue_stale_searches: requeued #%d (%r/%r, was %s)",
                sid, niche, city, status_,
            )
        except Exception as e:
            logger.warning(
                "admin_requeue_stale_searches: failed to requeue #%d: %s", sid, e
            )

    return {
        "requeued": len(requeued_ids),
        "requeued_ids": requeued_ids,
        "older_than_minutes": older_than_minutes,
        "hint": (
            f"Переставлено {len(requeued_ids)} поисков в очередь. "
            "Проверь /app/leads/history через 5-15 мин — статус должен смениться на completed."
        ),
    }


@router.post("/admin/soften-pain-labels")
@limiter.limit("2/minute")
async def admin_soften_pain_labels(
    request: Request,
    _: "User" = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Применяет _soften_pain_label ко всем существующим PainTag в БД.

    Контекст: при первом recluster'е до 2026-06-10 LLM генерировал
    обвинительные формулировки («Мошенничество с ценами», «Развод
    клиентов»). Это плохо смотрится в карточке-лиде и юридически рискованно
    в исходящих письмах. С нового релиза промпт и post-process делают
    label нейтральным, но УЖЕ СОЗДАННЫЕ теги нужно пере-смягчить
    в БД одним проходом — иначе ждать пере-recluster'а каждой ниши.

    Endpoint меняет только текстовые поля (label, description) активных
    тегов; centroid'ы, привязки review_pain_tags и company_pain_scores
    остаются — это просто переименование.
    """
    from app.modules.reviews_ai.llm import _soften_pain_label

    tags = (
        (await db.execute(select(PainTag).where(PainTag.status == "active")))
        .scalars()
        .all()
    )
    changed = 0
    for tag in tags:
        new_label = _soften_pain_label(tag.label or "")
        new_desc = _soften_pain_label(tag.description or "")
        if new_label != (tag.label or "") or new_desc != (tag.description or ""):
            tag.label = new_label
            if tag.description is not None:
                tag.description = new_desc
            changed += 1
    if changed > 0:
        await db.commit()
    return {"scanned": len(tags), "softened": changed}


@router.post("/admin/recluster-niche/diagnostic")
@limiter.limit("3/minute")
async def admin_recluster_niche_diagnostic(
    request: Request,
    search_id: int = Query(...),
    user_id: int = Depends(_superuser_id),
    db: AsyncSession = Depends(get_db),
):
    """СИНХРОННЫЙ recluster для отладки. Не ставит задачу в Celery — выполняет
    кластеризацию прямо в HTTP-запросе и возвращает все промежуточные счётчики:

      - reviews_with_embedding — сколько отзывов прошло в кластеризацию
      - clusters_found         — сколько кластеров создалось (HDBSCAN или KMeans fallback)
      - pain_tags_upserted     — сколько PainTag в БД создано/обновлено
      - companies_with_pains_after — сколько компаний получило pain-теги после match
      - error                  — если что-то упало, текст ошибки

    Юзер может дернуть прямо из UI «AI завис» → видит точную причину.
    """
    from app.models.maps import MapSearchResult
    from app.models.pain_tag import CompanyPainScore
    from app.modules.reviews_ai import service as ai_service

    search = await _get_owned_search(db, search_id, user_id)
    if not search.niche or not search.city:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="У поиска не указана ниша или город — diagnostic невозможен.",
        )

    company_ids_rows = (
        await db.execute(
            select(MapSearchResult.company_id).where(
                MapSearchResult.map_search_id == search.id
            )
        )
    ).scalars().all()
    company_ids = [int(c) for c in company_ids_rows]

    reviews_with_embedding = (
        await db.execute(
            select(sa_func.count(Review.id)).where(
                Review.company_id.in_(company_ids) if company_ids else False,
                Review.embedding.is_not(None),
            )
        )
    ).scalar() or 0

    result: dict = {
        "search_id": search.id,
        "niche": search.niche,
        "city": search.city,
        "companies_total": len(company_ids),
        "reviews_with_embedding": int(reviews_with_embedding),
        "clusters_found": 0,
        "pain_tags_upserted": 0,
        "companies_with_pains_after": 0,
        "error": None,
    }

    if reviews_with_embedding == 0:
        result["error"] = "Нет ни одного отзыва с embedding — analyze не отрабатывал"
        return result

    try:
        n_tags = await ai_service.recluster_pains_for_niche(
            db, search.niche, search.city, company_ids=company_ids,
        )
        result["pain_tags_upserted"] = int(n_tags)

        # Сколько компаний поиска получили хотя бы один pain-tag
        cwp = (
            await db.execute(
                select(sa_func.count(sa_func.distinct(CompanyPainScore.company_id))).where(
                    CompanyPainScore.company_id.in_(company_ids),
                )
            )
        ).scalar() or 0
        result["companies_with_pains_after"] = int(cwp)

        # Сколько активных pain-tags теперь для (niche, city)
        from app.models.pain_tag import PainTag
        pt_q = select(sa_func.count(PainTag.id)).where(
            PainTag.niche == search.niche,
            PainTag.status == "active",
            PainTag.city == search.city,
        )
        result["clusters_found"] = int((await db.execute(pt_q)).scalar() or 0)
    except Exception as e:
        logger.exception("recluster diagnostic failed")
        result["error"] = f"{type(e).__name__}: {e}"

    return result


@router.get("/search/{search_id}/ai-progress")
@limiter.limit("60/minute")
async def get_ai_progress(
    request: Request,
    search_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Прогресс AI-разбора отзывов для конкретного поиска.

    UI поллит этот эндпоинт раз в ~5 секунд после клика «Разобрать боли AI»,
    чтобы показать реальный прогресс-бар (а не молча ждать 4 минуты).

    Возвращает счётчики на трёх уровнях цепочки:
      1. reviews_total / reviews_with_embedding / reviews_with_sentiment
         — сколько отзывов реально обработал `analyze_reviews_for_company`
      2. companies_with_pains — сколько компаний уже получили pain-tags
         после `recluster_pains_for_niche_task`
      3. stage — грубая оценка фазы для UI:
           'idle'     — нет отзывов вообще (нечего разбирать)
           'analyzing'— ставим embeddings/sentiment
           'clustering'— embeddings готовы, ждём recluster
           'ready'    — у части компаний уже есть pain-tags
    """
    from app.models.maps import MapSearchResult
    from app.models.pain_tag import CompanyPainScore

    search = await _get_owned_search(db, search_id, user_id)

    # Все company_id этого поиска
    company_ids_rows = (
        await db.execute(
            select(MapSearchResult.company_id).where(
                MapSearchResult.map_search_id == search.id
            )
        )
    ).scalars().all()
    company_ids = [int(c) for c in company_ids_rows]
    companies_total = len(company_ids)

    if companies_total == 0:
        return {
            "companies_total": 0,
            "companies_with_pains": 0,
            "reviews_total": 0,
            "reviews_with_embedding": 0,
            "reviews_with_sentiment": 0,
            "pain_tags_total": 0,
            "stage": "idle",
            "percent": 0,
        }

    reviews_total = (
        await db.execute(
            select(sa_func.count(Review.id)).where(Review.company_id.in_(company_ids))
        )
    ).scalar() or 0
    reviews_with_embedding = (
        await db.execute(
            select(sa_func.count(Review.id)).where(
                Review.company_id.in_(company_ids),
                Review.embedding.is_not(None),
            )
        )
    ).scalar() or 0
    reviews_with_sentiment = (
        await db.execute(
            select(sa_func.count(Review.id)).where(
                Review.company_id.in_(company_ids),
                Review.sentiment.is_not(None),
            )
        )
    ).scalar() or 0
    companies_with_pains = (
        await db.execute(
            select(sa_func.count(sa_func.distinct(CompanyPainScore.company_id))).where(
                CompanyPainScore.company_id.in_(company_ids),
            )
        )
    ).scalar() or 0
    # Активные pain-теги, созданные recluster'ом для (search.niche, search.city).
    # Нужно чтобы UI отличал «recluster ещё не отработал» (= 0) от
    # «теги созданы, идёт матч → company_pain_scores заполняется».
    pain_tags_q = select(sa_func.count(PainTag.id)).where(
        PainTag.niche == search.niche, PainTag.status == "active",
    )
    if search.city is not None:
        pain_tags_q = pain_tags_q.where(PainTag.city == search.city)
    pain_tags_total = (await db.execute(pain_tags_q)).scalar() or 0

    # Грубая оценка фазы для UI
    if reviews_total == 0:
        stage = "idle"
        percent = 0
    elif companies_with_pains > 0:
        stage = "ready"
        # Прогресс: какая доля компаний поиска уже получила pain-теги
        percent = round(companies_with_pains * 100 / max(1, companies_total))
    elif reviews_with_embedding >= max(1, reviews_total * 0.5):
        # Половина и больше отзывов проиндексирована — ждём финальный recluster
        stage = "clustering"
        if pain_tags_total > 0:
            # Теги созданы, матч уже идёт — почти готово
            percent = 90
        else:
            # ~70% — analyze почти готов, recluster ещё впереди
            percent = max(70, round(reviews_with_embedding * 70 / reviews_total))
    else:
        stage = "analyzing"
        # До 60% — масштабируем по embeddings (analyze — главная медленная часть)
        percent = round(reviews_with_embedding * 60 / max(1, reviews_total))

    return {
        "companies_total": companies_total,
        "companies_with_pains": int(companies_with_pains),
        "reviews_total": int(reviews_total),
        "reviews_with_embedding": int(reviews_with_embedding),
        "reviews_with_sentiment": int(reviews_with_sentiment),
        "pain_tags_total": int(pain_tags_total),
        "stage": stage,
        "percent": min(100, int(percent)),
    }


@router.post("/admin/recompute-website-score")
@limiter.limit("2/minute")
async def admin_recompute_website_score(
    request: Request,
    only_null: bool = Query(default=True),
    limit: int = Query(default=2000, ge=1, le=10000),
    _: "User" = Depends(require_superuser),
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
    source: Optional[str] = Query(default=None, regex="^(2gis|yandex_maps|google)$"),
    date_from: Optional[str] = Query(default=None, alias="from"),
    date_to: Optional[str] = Query(default=None, alias="to"),
    # 2026-06-16: позитивные теги. Default 'negative' — поведение
    # эндпоинта обратно-совместимо для всех существующих фронт-вызовов
    # без параметра sentiment.
    sentiment: str = Query(default="negative", regex="^(negative|positive)$"),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Активные pain_tags для (niche, city, sentiment). Без city — глобальные теги ниши.

    Без фильтров — fast-path по PainTag.occurrences_count.

    С фильтрами `source`/`from`/`to` — пересчитываем occurrences по подмножеству
    отзывов через JOIN review_pain_tags → reviews (count distinct review_id с
    указанным source и попадающим в диапазон posted_at). Теги с 0 occurrences
    в окне фильтра не возвращаются.

    `sentiment='positive'` отдаёт теги-«сильные стороны» (хвалят клиенты).
    До запуска recluster_pain_tags по позитиву возвращается пустой список.
    """
    from datetime import datetime
    from app.models.pain_tag import ReviewPainTag

    has_filters = source is not None or date_from is not None or date_to is not None

    base_filter = [
        PainTag.niche == niche,
        PainTag.status == "active",
        PainTag.sentiment == sentiment,
    ]
    if city is None:
        base_filter.append(PainTag.city.is_(None))
    else:
        base_filter.append((PainTag.city == city) | (PainTag.city.is_(None)))

    if not has_filters:
        q = (
            select(PainTag)
            .where(*base_filter)
            .order_by(PainTag.occurrences_count.desc())
        )
        tags = list((await db.execute(q)).scalars().all())
        return [PainTagOut.model_validate(t) for t in tags]

    # Парсим даты лениво, чтобы 422 при невалидном вводе.
    def _parse(d: str | None) -> datetime | None:
        if not d:
            return None
        try:
            return datetime.fromisoformat(d)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"invalid date '{d}'") from exc

    dt_from = _parse(date_from)
    dt_to = _parse(date_to)

    occurrences_col = sa_func.count(sa_func.distinct(Review.id)).label("occ")
    review_filter = []
    if source is not None:
        review_filter.append(Review.source == source)
    if dt_from is not None:
        review_filter.append(Review.posted_at >= dt_from)
    if dt_to is not None:
        review_filter.append(Review.posted_at <= dt_to)

    q = (
        select(PainTag, occurrences_col)
        .join(ReviewPainTag, ReviewPainTag.pain_tag_id == PainTag.id)
        .join(Review, Review.id == ReviewPainTag.review_id)
        .where(*base_filter, *review_filter)
        .group_by(PainTag.id)
        .having(occurrences_col > 0)
        .order_by(occurrences_col.desc())
    )
    rows = list((await db.execute(q)).all())
    out: list[PainTagOut] = []
    for tag, occ in rows:
        item = PainTagOut.model_validate(tag)
        # Подменяем агрегированный counter на отфильтрованный — фронт показывает
        # «по выбранному источнику/периоду», не глобальное число.
        item.occurrences_count = int(occ)
        out.append(item)
    return out


@router.get("/pains/companies", response_model=CompaniesByPainListOut)
@limiter.limit("60/minute")
async def list_companies_by_pain(
    request: Request,
    pain_key: Optional[str] = Query(default=None, min_length=2, max_length=64),
    pain_tag_ids: Optional[list[int]] = Query(default=None, description="Конкретные PainTag.id — альтернатива pain_key"),
    city: Optional[str] = Query(default=None, max_length=100),
    niche: Optional[str] = Query(default=None, max_length=100),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Глобальный список компаний по конкретной боли.

    Способа выборки два:
    - `pain_key` — крупная категория из PAIN_KEYS (call_no_answer,
      schedule_hard, ...). Мапим label→pain_key через match_pain_key.
    - `pain_tag_ids` — прямой список PainTag.id (для клика по плитке
      или combobox-поиска по тексту тега). 2026-07-13: добавлено чтобы
      UI мог показывать плитку топ-тегов ниши и/или искать по тексту,
      минуя PAIN_KEYS (у нас всего 8, а pain_tag'ов сотни).

    Ровно один из pain_key/pain_tag_ids обязателен.
    """
    from app.modules.outreach.pain_dictionaries import PAIN_KEYS, match_pain_key
    from app.models.pain_tag import CompanyPainScore

    if not pain_key and not pain_tag_ids:
        raise HTTPException(
            status_code=422,
            detail="нужен pain_key или pain_tag_ids",
        )
    if pain_key and pain_tag_ids:
        raise HTTPException(
            status_code=422,
            detail="передай что-то одно: pain_key ИЛИ pain_tag_ids",
        )

    matched_tag_ids: list[int] = []
    matched_labels: list[str] = []

    if pain_tag_ids:
        # Прямой выбор тегов — подтягиваем labels для отладки/UI, и
        # заодно валидируем что теги активные и негативные (иначе
        # можно было бы просунуть positive и получить лидов «сильных
        # сторон» в разделе болей).
        rows = list((await db.execute(
            select(PainTag.id, PainTag.label).where(
                PainTag.id.in_(pain_tag_ids),
                PainTag.status == "active",
                PainTag.sentiment == "negative",
            )
        )).all())
        for tid, label in rows:
            matched_tag_ids.append(int(tid))
            matched_labels.append(label)
    else:
        if pain_key not in PAIN_KEYS:
            raise HTTPException(
                status_code=422,
                detail=f"unknown pain_key={pain_key!r}. Валидные: {list(PAIN_KEYS)}",
            )

        tag_filter = [PainTag.status == "active", PainTag.sentiment == "negative"]
        if niche:
            tag_filter.append(PainTag.niche == niche)
        if city:
            # Городские теги + глобальные для ниши (city=NULL).
            tag_filter.append(or_(PainTag.city == city, PainTag.city.is_(None)))

        tag_rows = list(
            (await db.execute(
                select(PainTag.id, PainTag.label).where(*tag_filter)
            )).all()
        )
        seen_labels: set[str] = set()
        for tid, label in tag_rows:
            if match_pain_key(label) == pain_key:
                matched_tag_ids.append(int(tid))
                if label not in seen_labels:
                    matched_labels.append(label)
                    seen_labels.add(label)

    if not matched_tag_ids:
        return CompaniesByPainListOut(
            pain_key=pain_key or "", pain_labels=[], total=0, limit=limit, offset=offset, items=[],
        )

    # Агрегируем по компании: сумма mention_count + top_quote с максимальной
    # similarity. Оба через оконку — так одним запросом.
    mention_sum = sa_func.sum(CompanyPainScore.mention_count).label("mentions")

    # Для каждой компании выбираем top_quote c максимальной similarity —
    # оконка row_number() + фильтр rn=1. Одним подзапросом, без Python-loop.
    quote_row_num = sa_func.row_number().over(
        partition_by=CompanyPainScore.company_id,
        order_by=CompanyPainScore.top_quote_similarity.desc().nulls_last(),
    ).label("rn")

    quote_sub = (
        select(
            CompanyPainScore.company_id.label("company_id"),
            CompanyPainScore.top_quote.label("top_quote"),
            quote_row_num,
        )
        .where(CompanyPainScore.pain_tag_id.in_(matched_tag_ids))
        .subquery()
    )
    best_quote_sub = (
        select(quote_sub.c.company_id, quote_sub.c.top_quote)
        .where(quote_sub.c.rn == 1)
        .subquery()
    )

    # Итоговый запрос: агрегируем mention_count + join best_quote + join Company
    # с опциональными фильтрами по компании.
    company_filter = []
    if city:
        company_filter.append(Company.city == city)
    if niche:
        company_filter.append(Company.niche == niche)

    base = (
        select(
            Company,
            mention_sum,
            best_quote_sub.c.top_quote,
        )
        .join(CompanyPainScore, CompanyPainScore.company_id == Company.id)
        .join(best_quote_sub, best_quote_sub.c.company_id == Company.id, isouter=True)
        .where(
            CompanyPainScore.pain_tag_id.in_(matched_tag_ids),
            *company_filter,
        )
        .group_by(Company.id, best_quote_sub.c.top_quote)
        .order_by(mention_sum.desc(), Company.reviews_count.desc())
    )

    # total = число уникальных компаний
    total_stmt = (
        select(sa_func.count(sa_func.distinct(Company.id)))
        .join(CompanyPainScore, CompanyPainScore.company_id == Company.id)
        .where(
            CompanyPainScore.pain_tag_id.in_(matched_tag_ids),
            *company_filter,
        )
    )
    total = int((await db.execute(total_stmt)).scalar() or 0)

    rows = list((await db.execute(base.limit(limit).offset(offset))).all())

    items: list[CompanyByPainOut] = []
    for company, mentions, top_quote in rows:
        item = CompanyByPainOut.model_validate(company)
        item.pain_mention_count = int(mentions or 0)
        item.top_quote = top_quote
        items.append(item)

    return CompaniesByPainListOut(
        pain_key=pain_key or "",
        pain_labels=matched_labels,
        total=total,
        limit=limit,
        offset=offset,
        items=items,
    )


@router.get("/health/providers", response_model=ProvidersHealthOut)
async def health_providers(db: AsyncSession = Depends(get_db)):
    """Текущий статус доступности провайдеров (без реальных HTTP-запросов).

    Поля:
      - twogis: 'ok' если API-ключ задан, иначе 'no_api_key'.
      - yandex_maps: 'ok' если USE_PROXY=true (без прокси быстро забанит),
        иначе 'no_proxy'.
      - dadata: 'ok' если DADATA_API_KEY задан; иначе 'no_api_key'.
        details.dadata_enriched — сколько компаний уже обогащено (status='ok').
      - llm: 'ok' если OPENAI_API_KEY (или ProxyAPI ключ) задан и есть хоть один
        ai_assistant с непустой model. Иначе подробный статус о причине.
      - sentry: 'on' если SENTRY_DSN задан, иначе 'off'.

    Эндпоинт не делает реальных HTTP-запросов наружу — это «есть ли ключ
    в env + соответствующая запись в БД». Реальные HTTP-проверки оставлены
    провайдер-конкретным health'ам (например /admin → DaData ping)
    чтобы не задерживать общий dashboard и не есть free-tier лимиты.
    """
    twogis_settings = "ok" if settings.TWOGIS_API_KEY else "no_api_key"
    yandex_maps_settings = "ok" if settings.USE_PROXY else "no_proxy"
    google_maps_settings = "ok" if (settings.SERPAPI_KEY or "").strip() else "no_api_key"

    # Карта-провайдеры (2GIS / Yandex / Google) — приоритет за БД-настройками,
    # fallback на env (обратная совместимость со старыми стендами без UI-настроек).
    try:
        from app.modules.maps.providers_settings_service import get_status as _get_maps_status
        maps_status = await _get_maps_status(db)
        twogis = maps_status.get("twogis", twogis_settings)
        yandex_maps = maps_status.get("yandex_maps", yandex_maps_settings)
        google_maps = maps_status.get("google_maps", google_maps_settings)
    except Exception:
        twogis = twogis_settings
        yandex_maps = yandex_maps_settings
        google_maps = google_maps_settings

    # DaData
    dadata = "ok" if (settings.DADATA_API_KEY or "").strip() else "no_api_key"

    # LLM: ключ от OpenAI/ProxyAPI/Anthropic + хотя бы один ai_assistant
    # с непустой model в БД (иначе pick_assistant_id вернёт None — vendор
    # на свече, AI-пайплайны no-op'нут).
    have_openai = bool((settings.OPENAI_API_KEY or "").strip())
    from app.models.ai_assistant import AiAssistant
    have_assistant = (await db.execute(
        select(sa_func.count(AiAssistant.id)).where(AiAssistant.model.isnot(None))
    )).scalar_one() or 0
    if not have_openai:
        llm = "no_api_key"
    elif have_assistant == 0:
        llm = "no_assistant_configured"
    else:
        llm = "ok"

    # Sentry
    sentry_dsn = (settings.SENTRY_DSN or "").strip()
    sentry = "on" if sentry_dsn else "off"

    # Details: счётчики для DaData/AI которые юзер хочет видеть рядом.
    details: dict[str, Any] = {}
    try:
        from app.models.company_legal import CompanyLegal
        enriched_cnt = (await db.execute(
            select(sa_func.count(CompanyLegal.id)).where(CompanyLegal.status == "ok")
        )).scalar_one() or 0
        details["dadata_enriched"] = int(enriched_cnt)
    except Exception:
        # БД-таблицы может не быть в очень старых стендах — не валим health.
        pass
    details["ai_assistants_count"] = int(have_assistant)
    details["environment"] = settings.ENVIRONMENT

    return ProvidersHealthOut(
        twogis=twogis,
        yandex_maps=yandex_maps,
        google_maps=google_maps,
        dadata=dadata,
        llm=llm,
        sentry=sentry,
        details=details,
    )
