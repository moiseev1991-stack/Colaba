"""Тесты провайдера 2GIS.

Не дёргаем реальный API — _request мокается через monkeypatch.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.modules.maps.providers import MissingAPIKeyError
from app.modules.maps.providers.twogis import (
    CITY_TO_REGION_ID,
    TWOGIS_FALLBACK_REGION_ID,
    TwoGisProvider,
    resolve_region_id,
)


# ---------------------------------------------------------------------------
# Synchronous unit tests for helpers
# ---------------------------------------------------------------------------


def test_resolve_region_id_known_city():
    assert resolve_region_id("Москва") == CITY_TO_REGION_ID["москва"]
    assert resolve_region_id("САНКТ-ПЕТЕРБУРГ") == CITY_TO_REGION_ID["санкт-петербург"]
    assert resolve_region_id("  казань  ") == CITY_TO_REGION_ID["казань"]


def test_city_not_in_map_uses_fallback_region():
    assert resolve_region_id("Барнаул") == TWOGIS_FALLBACK_REGION_ID
    assert resolve_region_id("") == TWOGIS_FALLBACK_REGION_ID
    assert resolve_region_id(None) == TWOGIS_FALLBACK_REGION_ID  # type: ignore[arg-type]


def test_missing_api_key_raises_on_init():
    with pytest.raises(MissingAPIKeyError):
        TwoGisProvider(api_key="")


def test_provider_constructed_with_key():
    p = TwoGisProvider(api_key="dummy")
    assert p.source_name == "2gis"


# ---------------------------------------------------------------------------
# Helpers for async tests: mock TwoGisProvider._request
# ---------------------------------------------------------------------------


class _RequestRecorder:
    """Заменяет TwoGisProvider._request. Хранит calls + отдаёт ответы из очереди."""

    def __init__(self, responses: list[dict[str, Any]]):
        self._responses = list(responses)
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def __call__(self, _client, url: str, params: dict[str, Any]) -> dict[str, Any]:
        self.calls.append((url, dict(params)))
        if not self._responses:
            raise AssertionError(f"unexpected request to {url} with params={params}")
        return self._responses.pop(0)


def _make_provider_with_responses(monkeypatch, responses: list[dict[str, Any]]) -> tuple[TwoGisProvider, _RequestRecorder]:
    rec = _RequestRecorder(responses)
    monkeypatch.setattr(TwoGisProvider, "_request", rec)
    provider = TwoGisProvider(api_key="dummy", rate_limit_delay=0)
    return provider, rec


# ---------------------------------------------------------------------------
# search_companies tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_search_companies_happy_path(monkeypatch, twogis_search_page1):
    provider, rec = _make_provider_with_responses(monkeypatch, [twogis_search_page1])

    companies = []
    async for c in provider.search_companies("стоматология", "Москва", limit=10):
        companies.append(c)

    # 3 items в фикстуре, все валидные
    assert len(companies) == 3
    first = companies[0]
    assert first.source == "2gis"
    assert first.external_id == "70000001046123456"
    assert first.name == "Стоматология «Улыбка»"
    assert first.phone == "+74951234567"
    assert first.website == "https://ulybka.ru"
    assert first.rating == pytest.approx(4.2)
    assert first.reviews_count == 87
    assert first.lat == pytest.approx(55.7558)
    assert first.lng == pytest.approx(37.6173)
    # niche/city проставляются провайдером (не из ответа источника)
    assert first.niche == "стоматология"
    assert first.city == "Москва"
    # raw_data сохраняется
    assert first.raw_data is not None and first.raw_data["id"] == "70000001046123456"

    # last (без contact_groups и reviews) — всё опционально, но валидный
    last = companies[2]
    assert last.phone is None
    assert last.rating is None
    assert last.reviews_count == 0

    # один HTTP-запрос (одна страница, items < PAGE_SIZE → стопаем)
    assert len(rec.calls) == 1
    url, params = rec.calls[0]
    assert url.endswith("/3.0/items")
    assert params["q"] == "стоматология"
    assert params["region_id"] == CITY_TO_REGION_ID["москва"]
    assert params["page"] == 1


@pytest.mark.asyncio
async def test_search_companies_pagination(monkeypatch):
    """Если first page вернул ровно PAGE_SIZE и total больше — идём дальше."""
    from app.modules.maps.providers.twogis import PAGE_SIZE

    page1_items = [
        {"id": f"id-{i}", "name": f"Company {i}", "point": {"lat": 55.0, "lon": 37.0}}
        for i in range(PAGE_SIZE)
    ]
    page2_items = [{"id": "id-50", "name": "Company 50", "point": {"lat": 55.0, "lon": 37.0}}]
    responses = [
        {"result": {"items": page1_items, "total": 51}},
        {"result": {"items": page2_items, "total": 51}},
    ]
    provider, rec = _make_provider_with_responses(monkeypatch, responses)

    companies = []
    async for c in provider.search_companies("clinic", "Москва", limit=100):
        companies.append(c)

    assert len(companies) == PAGE_SIZE + 1
    assert len(rec.calls) == 2
    assert rec.calls[0][1]["page"] == 1
    assert rec.calls[1][1]["page"] == 2


@pytest.mark.asyncio
async def test_search_companies_respects_limit(monkeypatch, twogis_search_page1):
    provider, rec = _make_provider_with_responses(monkeypatch, [twogis_search_page1])
    companies = []
    async for c in provider.search_companies("стоматология", "Москва", limit=2):
        companies.append(c)
    assert len(companies) == 2


@pytest.mark.asyncio
async def test_search_companies_city_not_in_map_uses_fallback(monkeypatch, twogis_search_page1):
    provider, rec = _make_provider_with_responses(monkeypatch, [twogis_search_page1])
    async for _ in provider.search_companies("ремонт", "Барнаул", limit=10):
        pass
    assert rec.calls[0][1]["region_id"] == TWOGIS_FALLBACK_REGION_ID


# ---------------------------------------------------------------------------
# fetch_reviews tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_reviews_happy_path(monkeypatch, twogis_reviews_response):
    provider, rec = _make_provider_with_responses(monkeypatch, [twogis_reviews_response])
    reviews = []
    async for r in provider.fetch_reviews("70000001046123456", limit=50):
        reviews.append(r)

    # 4 items в фикстуре, последний (без text+rating) отбрасывается, 3 остаются
    assert len(reviews) == 3
    assert reviews[0].external_id == "rev-1001"
    assert reviews[0].author_masked == "И. И."
    assert reviews[0].rating == 5
    assert reviews[0].has_owner_reply is False
    assert reviews[1].has_owner_reply is True  # is_reply_by_owner=True во второй
    assert reviews[2].author_masked == "Аноним"  # user без name

    # offset=0, один запрос (items < REVIEWS_PAGE_SIZE)
    assert len(rec.calls) == 1
    assert rec.calls[0][1]["offset"] == 0
    assert rec.calls[0][1]["object_id"] == "70000001046123456"


@pytest.mark.asyncio
async def test_fetch_reviews_pagination(monkeypatch):
    """offset должен прирастать на REVIEWS_PAGE_SIZE при полной странице."""
    from app.modules.maps.providers.twogis import REVIEWS_PAGE_SIZE

    page1_items = [
        {"id": f"r-{i}", "user": {"name": "X Y"}, "rating": 5, "text": "ok"}
        for i in range(REVIEWS_PAGE_SIZE)
    ]
    page2_items = [{"id": "r-last", "user": {"name": "Z"}, "rating": 1, "text": "плохо"}]
    responses = [
        {"result": {"items": page1_items}},
        {"result": {"items": page2_items}},
    ]
    provider, rec = _make_provider_with_responses(monkeypatch, responses)
    reviews = []
    async for r in provider.fetch_reviews("test-id", limit=200):
        reviews.append(r)

    assert len(reviews) == REVIEWS_PAGE_SIZE + 1
    assert rec.calls[0][1]["offset"] == 0
    assert rec.calls[1][1]["offset"] == REVIEWS_PAGE_SIZE
