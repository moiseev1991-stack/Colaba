"""Фильтры для списка компаний поиска.

apply_filters берёт SQLAlchemy Select c FROM Company и накладывает условия
из MapSearchFilter + сортировку. Используется в service.get_search_results
и в API-эндпоинте GET /maps/search/{id}/companies.

Фильтр pain_tag_ids требует таблиц pain_tags / company_pain_scores (миграция 016).
До неё фильтр молча игнорируется. После — JOIN с CompanyPainScore + WHERE.
"""

from __future__ import annotations

import logging

from sqlalchemy import Select, exists, select

from app.models.maps import Company, Review
from app.modules.maps.schemas import MapSearchFilter

logger = logging.getLogger(__name__)


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

    # ---- WHERE: тексты отзывов (EXISTS-подзапрос на reviews)
    # Каждое условие — независимый EXISTS, чтобы AND работал как «есть и тот
    # и тот отзыв» (а не «один отзыв удовлетворяет обоим»). NOT contains —
    # тоже корректно: запрещаем наличие хотя бы одного matching отзыва.
    if filters.review_text_contains:
        pattern = f"%{filters.review_text_contains.strip()}%"
        if pattern.strip("%"):
            query = query.where(
                exists(
                    select(Review.id)
                    .where(Review.company_id == Company.id, Review.raw_text.ilike(pattern))
                )
            )
    if filters.review_text_excludes:
        pattern = f"%{filters.review_text_excludes.strip()}%"
        if pattern.strip("%"):
            query = query.where(
                ~exists(
                    select(Review.id)
                    .where(Review.company_id == Company.id, Review.raw_text.ilike(pattern))
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
    elif sort_by == "pain_desc" and pain_sort_active:
        # Сортировка по сумме mention_count через подзапрос — корректно
        # отрабатывает даже если у компании несколько тегов из фильтра.
        from app.models.pain_tag import CompanyPainScore  # type: ignore

        query = query.order_by(CompanyPainScore.mention_count.desc())
    else:
        # default: rating_desc (включая случай 'pain_desc' без миграции 016)
        query = query.order_by(Company.rating.desc().nullslast())

    return query
