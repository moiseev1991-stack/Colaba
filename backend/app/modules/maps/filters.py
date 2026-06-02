"""Фильтры для списка компаний поиска.

apply_filters берёт SQLAlchemy Select c FROM Company и накладывает условия
из MapSearchFilter + сортировку. Используется в service.get_search_results
и в API-эндпоинте GET /maps/search/{id}/companies.

Фильтр pain_tag_ids требует таблиц pain_tags / company_pain_scores (миграция 016).
До неё фильтр молча игнорируется. После — JOIN с CompanyPainScore + WHERE.
"""

from __future__ import annotations

import logging

from sqlalchemy import Select, exists, or_, select

from app.models.maps import Company, Review
from app.modules.maps.schemas import MapSearchFilter

logger = logging.getLogger(__name__)


def _collect_terms(single: str | None, many: list[str] | None) -> list[str]:
    """Объединяет legacy single-строку и новый массив в один dedup-список
    непустых term'ов. Пустые элементы и whitespace-only отбрасываются."""
    out: list[str] = []
    seen: set[str] = set()
    if single:
        t = single.strip()
        if t and t.lower() not in seen:
            seen.add(t.lower())
            out.append(t)
    if many:
        for raw in many:
            t = (raw or "").strip()
            if t and t.lower() not in seen:
                seen.add(t.lower())
                out.append(t)
    return out


def apply_filters(query: Select, filters: MapSearchFilter) -> Select:
    """Накладывает фильтры и сортировку на Select(Company)."""

    # ---- WHERE: scalar filters
    if filters.min_rating is not None:
        query = query.where(Company.rating >= filters.min_rating)
    if filters.max_rating is not None:
        query = query.where(Company.rating <= filters.max_rating)
    if filters.min_reviews is not None:
        query = query.where(Company.reviews_count >= filters.min_reviews)
    if filters.min_negative is not None:
        query = query.where(Company.reviews_negative_count >= filters.min_negative)
    if filters.has_owner_replies is not None:
        query = query.where(Company.has_owner_replies == filters.has_owner_replies)
    if filters.has_website is not None:
        # 2GIS иногда отдаёт "", " " или строку только из пробелов —
        # фронт-индикатор такие считает «нет сайта», SQL-фильтр должен
        # вести себя так же, иначе фильтр и pill расходятся.
        from sqlalchemy import func
        trimmed = func.btrim(func.coalesce(Company.website, ""))
        if filters.has_website:
            query = query.where(trimmed != "")
        else:
            query = query.where(trimmed == "")

    # ---- WHERE: тексты отзывов (EXISTS-подзапрос на reviews)
    # Объединяем legacy single-форму и новую *_any-форму в один список.
    # contains: компания пройдёт, если у неё ЕСТЬ отзыв с ЛЮБЫМ из слов (OR).
    # excludes: компания пройдёт, если у неё НЕТ отзыва ни с ОДНИМ из слов.
    contains_terms = _collect_terms(filters.review_text_contains, filters.review_text_contains_any)
    excludes_terms = _collect_terms(filters.review_text_excludes, filters.review_text_excludes_any)

    if contains_terms:
        conds = [Review.raw_text.ilike(f"%{t}%") for t in contains_terms]
        query = query.where(
            exists(
                select(Review.id)
                .where(Review.company_id == Company.id, or_(*conds))
            )
        )
    if excludes_terms:
        conds = [Review.raw_text.ilike(f"%{t}%") for t in excludes_terms]
        query = query.where(
            ~exists(
                select(Review.id)
                .where(Review.company_id == Company.id, or_(*conds))
            )
        )

    # ---- WHERE: pain tags (требует таблиц из миграции 016)
    pain_sort_active = filters.sort_by == "pain_desc"
    if filters.pain_tag_ids:
        try:
            from app.models.pain_tag import CompanyPainScore  # type: ignore
        except ImportError:
            logger.info("apply_filters: pain_tag_ids указаны, но модель ещё не создана (миграция 016 не накатана) — фильтр игнорируется")
            pain_sort_active = False  # не можем сортировать по тому, чего нет
        else:
            query = query.join(
                CompanyPainScore,
                CompanyPainScore.company_id == Company.id,
            ).where(
                CompanyPainScore.pain_tag_id.in_(filters.pain_tag_ids),
                CompanyPainScore.mention_count >= filters.min_pain_mentions,
            )

    # ---- ORDER BY
    sort_by = filters.sort_by
    if sort_by == "rating_asc":
        query = query.order_by(Company.rating.asc().nullslast())
    elif sort_by == "reviews_desc":
        query = query.order_by(Company.reviews_count.desc())
    elif sort_by == "negative_desc":
        query = query.order_by(Company.reviews_negative_count.desc())
    elif sort_by == "temperature_desc":
        query = query.order_by(Company.lead_temperature.desc().nullslast())
    elif sort_by == "pain_desc" and pain_sort_active:
        # Сортировка по сумме mention_count через подзапрос — корректно
        # отрабатывает даже если у компании несколько тегов из фильтра.
        from app.models.pain_tag import CompanyPainScore  # type: ignore

        query = query.order_by(CompanyPainScore.mention_count.desc())
    else:
        # default: rating_desc (включая случай 'pain_desc' без миграции 016)
        query = query.order_by(Company.rating.desc().nullslast())

    return query
