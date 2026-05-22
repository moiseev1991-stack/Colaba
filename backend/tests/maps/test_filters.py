"""Тесты filters.apply_filters — генерация SQL, без БД."""

from __future__ import annotations

from sqlalchemy import select

from app.models.maps import Company
from app.modules.maps.filters import apply_filters
from app.modules.maps.schemas import MapSearchFilter


def _sql(query) -> str:
    return str(query.compile(compile_kwargs={"literal_binds": True}))


def test_filter_by_rating_range():
    q = select(Company)
    flt = MapSearchFilter(min_rating=4.0, max_rating=5.0)
    sql = _sql(apply_filters(q, flt))
    assert "companies.rating >= 4.0" in sql
    assert "companies.rating <= 5.0" in sql


def test_filter_by_min_reviews_and_min_negative():
    q = select(Company)
    flt = MapSearchFilter(min_reviews=10, min_negative=3)
    sql = _sql(apply_filters(q, flt))
    assert "companies.reviews_count >= 10" in sql
    assert "companies.reviews_negative_count >= 3" in sql


def test_filter_by_has_owner_replies():
    q = select(Company)
    flt_true = MapSearchFilter(has_owner_replies=True)
    sql_true = _sql(apply_filters(q, flt_true))
    assert "companies.has_owner_replies" in sql_true and "true" in sql_true.lower()

    flt_false = MapSearchFilter(has_owner_replies=False)
    sql_false = _sql(apply_filters(q, flt_false))
    assert "false" in sql_false.lower()


def test_sort_by_rating_desc_default():
    q = select(Company)
    sql = _sql(apply_filters(q, MapSearchFilter()))
    assert "ORDER BY companies.rating DESC" in sql


def test_sort_by_rating_asc():
    sql = _sql(apply_filters(select(Company), MapSearchFilter(sort_by="rating_asc")))
    assert "ORDER BY companies.rating ASC" in sql


def test_sort_by_reviews_desc():
    sql = _sql(apply_filters(select(Company), MapSearchFilter(sort_by="reviews_desc")))
    assert "ORDER BY companies.reviews_count DESC" in sql


def test_sort_by_negative_desc():
    sql = _sql(apply_filters(select(Company), MapSearchFilter(sort_by="negative_desc")))
    assert "ORDER BY companies.reviews_negative_count DESC" in sql


def test_pain_tag_filter_silently_skipped_when_models_missing():
    """До миграции 016 — pain_tag_ids фильтр должен не падать, а просто
    не накладываться. И pain_desc сорт деградирует до rating_desc."""
    q = select(Company)
    flt = MapSearchFilter(pain_tag_ids=[1, 2, 3], sort_by="pain_desc")
    sql = _sql(apply_filters(q, flt))
    # Никаких упоминаний company_pain_scores в SQL
    assert "company_pain_scores" not in sql
    # Сортировка ушла в дефолт
    assert "ORDER BY companies.rating DESC" in sql
