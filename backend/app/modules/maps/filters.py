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

    # ---- WHERE: legal (блок 2 ТЗ 2026-06-02) — добавляется JOIN
    if filters.min_revenue is not None or filters.min_age_years is not None:
        try:
            from app.models.company_legal import CompanyLegal
            from datetime import date, timedelta
        except ImportError:
            CompanyLegal = None  # type: ignore
        if CompanyLegal is not None:
            query = query.join(
                CompanyLegal, CompanyLegal.company_id == Company.id
            ).where(CompanyLegal.status == "ok")
            if filters.min_revenue is not None:
                query = query.where(CompanyLegal.revenue >= filters.min_revenue)
            if filters.min_age_years is not None:
                cutoff = date.today() - timedelta(days=int(filters.min_age_years * 365.25))
                query = query.where(CompanyLegal.registration_date <= cutoff)

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
    # Multi-source фильтр (ТЗ 2026-06-04): EXISTS-подзапрос на company_sources.
    # 'all'/None — без фильтра, '2gis'/'yandex_maps' — только компании с
    # соответствующим source-профилем. Склеенные мультисурс-компании остаются
    # в обоих вариантах (потому что у них есть профиль каждого источника).
    if filters.source_filter and filters.source_filter != "all":
        try:
            from app.models.maps import CompanySource
            query = query.where(
                exists(
                    select(CompanySource.id)
                    .where(
                        CompanySource.company_id == Company.id,
                        CompanySource.source == filters.source_filter,
                    )
                )
            )
        except ImportError:
            logger.info("apply_filters: source_filter указан, но CompanySource ещё не создан (миграция 028) — фильтр игнорируется")
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

    # 2026-06-19: фильтр «Тип юр.лица» (ООО/ИП/АО/...). Спец-значение
    # '__unknown__' в списке = «компании без opf» (нет CompanyLegal или
    # status!=ok или opf is NULL). OR между значениями.
    if filters.opf_in:
        try:
            from app.models.company_legal import CompanyLegal as _CL
            from sqlalchemy import and_ as _and, or_ as _or
            normal = [v for v in filters.opf_in if v and v != "__unknown__"]
            include_unknown = "__unknown__" in filters.opf_in
            conds = []
            if normal:
                conds.append(
                    exists(
                        select(_CL.id).where(
                            _CL.company_id == Company.id,
                            _CL.status == "ok",
                            _CL.opf.in_(normal),
                        )
                    )
                )
            if include_unknown:
                has_known_opf = exists(
                    select(_CL.id).where(
                        _CL.company_id == Company.id,
                        _CL.status == "ok",
                        _CL.opf.isnot(None),
                    )
                )
                conds.append(~has_known_opf)
            if conds:
                query = query.where(_or(*conds))
        except ImportError:
            logger.info("apply_filters: opf_in указан, но CompanyLegal недоступен — фильтр игнорируется")

    # 2026-06-12: фильтр «есть ЛПР». ЛПР хранится в двух местах:
    #   1) CompanyLegal.director_name (DaData)
    #   2) CompanyDecisionMaker (парсер /team на сайте)
    # has_lpr=True пропускает компанию, если есть ЛИБО непустой
    # director_name, ЛИБО хотя бы один decision_maker. False — обратное.
    if filters.has_lpr is not None:
        try:
            from app.models.company_legal import CompanyLegal
            from app.models.company_decision_maker import CompanyDecisionMaker
            from sqlalchemy import and_, func as _func

            legal_dir_exists = exists(
                select(CompanyLegal.id).where(
                    CompanyLegal.company_id == Company.id,
                    CompanyLegal.director_name.isnot(None),
                    _func.btrim(_func.coalesce(CompanyLegal.director_name, "")) != "",
                )
            )
            dm_exists = exists(
                select(CompanyDecisionMaker.id).where(
                    CompanyDecisionMaker.company_id == Company.id,
                )
            )
            if filters.has_lpr:
                query = query.where(or_(legal_dir_exists, dm_exists))
            else:
                query = query.where(and_(~legal_dir_exists, ~dm_exists))
        except ImportError:
            logger.info("apply_filters: has_lpr задан, но модели CompanyLegal/CompanyDecisionMaker недоступны — фильтр игнорируется")

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
    elif sort_by == "website_score_desc":
        query = query.order_by(Company.website_lead_score.desc().nullslast())
    elif sort_by == "pain_desc" and pain_sort_active:
        # Сортировка по сумме mention_count через подзапрос — корректно
        # отрабатывает даже если у компании несколько тегов из фильтра.
        from app.models.pain_tag import CompanyPainScore  # type: ignore

        query = query.order_by(CompanyPainScore.mention_count.desc())
    else:
        # default: rating_desc (включая случай 'pain_desc' без миграции 016)
        query = query.order_by(Company.rating.desc().nullslast())

    return query
