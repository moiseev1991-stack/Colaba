"""Тесты провайдера Яндекс.Карт.

fetch_with_retry мокается через monkeypatch — никаких реальных HTTP-запросов
к yandex.ru/maps. Капча-solver тоже мокается.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any
import httpx
import pytest

from app.modules.maps.providers import yandex_maps as ym
from app.modules.maps.providers.yandex_maps import (
    YandexMapsProvider,
    _extract_companies_from_html,
    _parse_unix_timestamp,
    extract_org_id_from_url,
)

FIXTURES = Path(__file__).parent / "fixtures"


# ---------------------------------------------------------------------------
# Synchronous unit tests
# ---------------------------------------------------------------------------


def test_extract_org_id_from_url():
    assert extract_org_id_from_url("https://yandex.ru/maps/org/cafe/1234567890/") == "1234567890"
    assert extract_org_id_from_url("https://yandex.ru/maps/org/x/999/?z=10") == "999"
    assert extract_org_id_from_url(None) is None
    assert extract_org_id_from_url("https://example.com/maps/") is None


def test_parse_unix_timestamp_seconds_and_ms():
    ts = _parse_unix_timestamp(1700000000)
    assert ts is not None and ts.year == 2023

    ts_ms = _parse_unix_timestamp(1700000000000)
    assert ts_ms is not None and ts_ms.year == 2023

    assert _parse_unix_timestamp(None) is None
    assert _parse_unix_timestamp("not-a-number") is None


def test_parse_jsonld_happy_path():
    html = (FIXTURES / "yandex_search_jsonld.html").read_text(encoding="utf-8")
    companies = _extract_companies_from_html(html)
    # 2 из ItemList + 1 standalone LocalBusiness = 3
    assert len(companies) == 3

    ids = {c.external_id for c in companies}
    assert ids == {"1010101010101", "2020202020202", "3030303030303"}

    by_id = {c.external_id: c for c in companies}
    first = by_id["1010101010101"]
    assert first.source == "yandex_maps"
    assert first.name == "Стоматология «Улыбка»"
    assert first.phone == "+74951112233"
    assert first.website == "https://ulybka-stom.ru"
    assert first.rating == pytest.approx(4.6)
    assert first.reviews_count == 128
    assert first.lat == pytest.approx(55.7558)
    assert first.lng == pytest.approx(37.6173)
    assert first.address == "ул. Тверская, 12"

    # standalone — без phone/website/rating
    third = by_id["3030303030303"]
    assert third.phone is None
    assert third.rating is None
    assert third.reviews_count == 0


def test_jsonld_skips_invalid_blocks():
    html = """
    <html><head>
    <script type="application/ld+json">not a json {</script>
    <script type="application/ld+json">{"@type": "WebPage", "name": "x"}</script>
    <script type="application/ld+json">{"@type": "LocalBusiness", "name": "no id"}</script>
    <script type="application/ld+json">{"@type": "LocalBusiness", "@id": "https://yandex.ru/maps/org/y/42/", "name": "Good"}</script>
    </head></html>
    """
    companies = _extract_companies_from_html(html)
    # WebPage без @id → skip; LocalBusiness без id → skip; только последний валидный
    assert len(companies) == 1
    assert companies[0].external_id == "42"
    assert companies[0].name == "Good"


# ---------------------------------------------------------------------------
# Helpers for async tests
# ---------------------------------------------------------------------------


def _make_response(text: str, status: int = 200, headers: dict[str, str] | None = None) -> httpx.Response:
    """Конструирует httpx.Response с текстом и заголовками. URL не важен для тестов."""
    return httpx.Response(
        status_code=status,
        request=httpx.Request("GET", "https://yandex.ru/maps/"),
        text=text,
        headers=headers or {},
    )


# ---------------------------------------------------------------------------
# search_companies — теперь идёт через Playwright (см. yandex_maps.py), требует
# живой chromium + прокси, юнит-тестами не покрываем (E2E на проде).
# Старые тесты, мокавшие httpx fetch_with_retry / JSON-LD parser, удалены —
# тот код-путь больше не вызывается.
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# fetch_reviews via SSR-HTML tests
# ---------------------------------------------------------------------------
#
# С 2026-06 Yandex закрыл /maps/api/business/fetchReviews для сторонних
# потребителей (отдаёт только {"csrfToken": ...}). Парсер переведён на
# SSR-HTML страницы /maps/org/{businessId}/reviews/. Тесты подменяют
# httpx.AsyncClient мок-клиентом, который возвращает мини-HTML с двумя
# отзывами и проверяют корректный mapping в ReviewRaw.


_REVIEW_HTML_FIXTURE = """
<!doctype html><html><body>
<div data-chunk="reviews">
  <div class="business-review-view" itemprop="review" itemscope itemtype="http://schema.org/Review">
    <meta itemprop="ratingValue" content="5.0"/>
    <meta itemprop="datePublished" content="2026-01-24T06:57:24.400Z"/>
    <div itemprop="author" itemscope itemtype="http://schema.org/Person">
      <span itemprop="name">Анна Петрова</span>
    </div>
    <span itemprop="reviewBody">Отличная клиника, всё понравилось.</span>
  </div>
  <div class="business-review-view" itemprop="review" itemscope itemtype="http://schema.org/Review">
    <meta itemprop="ratingValue" content="2.0"/>
    <meta itemprop="datePublished" content="2025-12-10T03:43:41Z"/>
    <div itemprop="author" itemscope itemtype="http://schema.org/Person">
      <span itemprop="name">Дмитрий М.</span>
    </div>
    <div class="business-review-view__body" itemprop="reviewBody">Долго ждал, грязно.</div>
    <div class="business-review-view__date _org-answer">Ответ владельца</div>
  </div>
</div>
</body></html>
"""


class _AsyncClientMock:
    """Минимальная замена httpx.AsyncClient для тестов fetch_reviews."""

    def __init__(self, response_factory):
        self._factory = response_factory
        self.calls: list[dict[str, Any]] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return False

    async def get(self, url, params=None):
        self.calls.append({"url": url, "params": dict(params or {})})
        return self._factory(url, params)


@pytest.mark.asyncio
async def test_fetch_reviews_ssr_html_happy_path(monkeypatch):
    """HTML-страница /maps/org/{id}/reviews/ → 2 отзыва со Schema.org разметкой."""
    captured_url: dict[str, str] = {}

    def factory(url, params):
        captured_url["url"] = url
        return _make_response(
            _REVIEW_HTML_FIXTURE,
            status=200,
            headers={"content-type": "text/html; charset=utf-8"},
        )

    mock_client = _AsyncClientMock(factory)
    monkeypatch.setattr(ym.httpx, "AsyncClient", lambda **kw: mock_client)

    provider = YandexMapsProvider(use_proxy=False)
    reviews = [r async for r in provider.fetch_reviews("1010101010101", limit=50)]

    # URL парсера — это страница reviews, а не AJAX endpoint.
    assert "/maps/org/1010101010101/reviews/" in captured_url["url"]
    assert len(reviews) == 2

    first = reviews[0]
    assert first.source == "yandex_maps"
    assert first.rating == 5
    assert first.author_masked  # mask_author применён, точная маска зависит от utils
    assert "Отличная клиника" in (first.raw_text or "")
    assert first.has_owner_reply is False
    assert isinstance(first.posted_at, datetime)
    assert first.posted_at.year == 2026

    second = reviews[1]
    assert second.rating == 2
    assert "Долго ждал" in (second.raw_text or "")
    # Блок с _org-answer присутствует → has_owner_reply True
    assert second.has_owner_reply is True


@pytest.mark.asyncio
async def test_fetch_reviews_returns_when_no_review_nodes(monkeypatch):
    """Если HTML без блоков отзывов (капча/редирект/баг) — стрим завершается пустым."""
    def factory(url, params):
        return _make_response("<html><body>nope</body></html>", status=200, headers={"content-type": "text/html"})

    mock_client = _AsyncClientMock(factory)
    monkeypatch.setattr(ym.httpx, "AsyncClient", lambda **kw: mock_client)

    provider = YandexMapsProvider(use_proxy=False)
    reviews = [r async for r in provider.fetch_reviews("x", limit=50)]
    assert reviews == []


@pytest.mark.asyncio
async def test_fetch_reviews_returns_on_non_200(monkeypatch):
    """Не-200 ответ (например, 403/429) → стрим завершается без ошибок."""
    def factory(url, params):
        return _make_response("forbidden", status=403, headers={"content-type": "text/html"})

    mock_client = _AsyncClientMock(factory)
    monkeypatch.setattr(ym.httpx, "AsyncClient", lambda **kw: mock_client)

    provider = YandexMapsProvider(use_proxy=False)
    reviews = [r async for r in provider.fetch_reviews("x", limit=50)]
    assert reviews == []
