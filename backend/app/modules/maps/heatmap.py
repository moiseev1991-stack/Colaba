"""Тепловые карты по нишам (блок 5 ТЗ 2026-06-02).

Аналитический слой над уже собранным поиском. Возвращает массив точек
{lat, lng, weight} для рендера Leaflet.heat на фронте. Никакого нового
парсинга — только агрегация существующих companies.* + companies_pain_scores.

Поддерживаемые слои (`layer`):
- `density`    — плотность компаний (вес = 1.0 для каждой точки;
                 интенсивность даёт сам Leaflet.heat по скоплению).
- `pain`       — концентрация боли (вес = sum(mention_count pain-тегов) /
                 нормировка). Где плохо / где много жалоб.
- `website`    — концентрация website-лидов (вес = website_lead_score / 100).
                 Где пакетно продавать сайты.
- `rating`     — слабый сервис (вес = 1.0 - rating/5). Низкий рейтинг → горячее.
- `wealth`     — платёжеспособность (заглушка: вес = lead_temperature / 100,
                 пока нет legal-данных из блока 2; после Блока 2 заменим
                 на оборот/возраст из company_legal).
"""

from __future__ import annotations

import logging
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.maps import Company, MapSearchResult


logger = logging.getLogger(__name__)


HeatmapLayer = Literal["density", "pain", "website", "rating", "wealth"]


async def build_points(
    db: AsyncSession,
    search_id: int,
    layer: HeatmapLayer,
) -> list[dict]:
    """Возвращает массив точек для leaflet-heat.

    Каждая точка — `{lat: float, lng: float, weight: float}`. weight в
    диапазоне 0..1 после нормализации (фронт сам решает как мапить в
    интенсивность тепла).
    """
    # Базовый стрит запрос компаний поиска с координатами.
    stmt = (
        select(
            Company.id,
            Company.lat,
            Company.lng,
            Company.rating,
            Company.reviews_count,
            Company.website_lead_score,
            Company.lead_temperature,
        )
        .join(MapSearchResult, MapSearchResult.company_id == Company.id)
        .where(MapSearchResult.map_search_id == search_id)
        .where(Company.lat.isnot(None))
        .where(Company.lng.isnot(None))
    )
    rows = list((await db.execute(stmt)).all())
    if not rows:
        return []

    # Для слоя 'pain' дёргаем суммы mention_count по компаниям одним запросом.
    pain_map: dict[int, int] = {}
    if layer == "pain":
        try:
            from app.models.pain_tag import CompanyPainScore
            cids = [r[0] for r in rows]
            pain_stmt = (
                select(
                    CompanyPainScore.company_id,
                    func.sum(CompanyPainScore.mention_count).label("total"),
                )
                .where(CompanyPainScore.company_id.in_(cids))
                .group_by(CompanyPainScore.company_id)
            )
            for cid, total in (await db.execute(pain_stmt)).all():
                pain_map[int(cid)] = int(total or 0)
        except ImportError:
            logger.info("heatmap.pain: CompanyPainScore unavailable")

    # Подготовим raw-веса по слоям, потом нормализуем по max.
    raw_weights: list[tuple[float, float, float]] = []  # (lat, lng, raw)
    for cid, lat, lng, rating, reviews_count, web_score, temp in rows:
        if lat is None or lng is None:
            continue
        lat_f = float(lat)
        lng_f = float(lng)

        if layer == "density":
            w = 1.0
        elif layer == "pain":
            w = float(pain_map.get(int(cid), 0))
        elif layer == "website":
            w = float(web_score or 0)
        elif layer == "rating":
            # «Где сервис слабый» — низкий рейтинг даёт высокий weight.
            # Если рейтинг 5.0 — 0.0, если 3.0 — 0.4, если NULL — 0.0.
            if rating is None:
                w = 0.0
            else:
                w = max(0.0, (5.0 - float(rating)) / 5.0) * float(reviews_count or 0)
        elif layer == "wealth":
            # До блока 2 (legal) приближаем «платёжеспособность» через
            # lead_temperature — он учитывает связку рейтинг+отзывы+контакты.
            w = float(temp or 0)
        else:
            w = 1.0

        raw_weights.append((lat_f, lng_f, max(w, 0.0)))

    if not raw_weights:
        return []

    # Нормализация: делим на max, чтобы получить 0..1. Для density всё 1.0
    # — оставим 1.0 (Leaflet.heat сам сгустит).
    max_w = max(w for _, _, w in raw_weights) or 1.0
    return [
        {"lat": lat, "lng": lng, "weight": (w / max_w) if max_w > 0 else 0.0}
        for lat, lng, w in raw_weights
    ]
