"""Тесты провайдера Яндекс.Карт.

fetch_with_retry мокается через monkeypatch — никаких реальных HTTP-запросов
к yandex.ru/maps. Капча-solver тоже мокается.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

import httpx
import pytest

from app.modules.maps.providers import CaptchaWallError
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
# search_companies tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_search_companies_happy_path(monkeypatch):
    html = (FIXTURES / "yandex_search_jsonld.html").read_text(encoding="utf-8")
    calls: list[dict[str, Any]] = []

    async def fake_fetch(url, **kwargs):
        calls.append({"url": url, **kwargs})
        return _make_response(html)

    monkeypatch.setattr(ym, "fetch_with_retry", fake_fetch)

    provider = YandexMapsProvider(use_proxy=False)
    companies = []
    async for c in provider.search_companies("стоматология", "Москва", limit=10):
        companies.append(c)

    assert len(companies) == 3
    # niche/city проставляются провайдером
    assert all(c.niche == "стоматология" and c.city == "Москва" for c in companies)
    # один запрос
    assert len(calls) == 1
    assert "text=" in calls[0]["url"]
    assert "yandex.ru/maps" in calls[0]["url"]


@pytest.mark.asyncio
async def test_search_companies_respects_limit(monkeypatch):
    html = (FIXTURES / "yandex_search_jsonld.html").read_text(encoding="utf-8")

    async def fake_fetch(url, **kwargs):
        return _make_response(html)

    monkeypatch.setattr(ym, "fetch_with_retry", fake_fetch)
    provider = YandexMapsProvider(use_proxy=False)

    companies = []
    async for c in provider.search_companies("стоматология", "Москва", limit=2):
        companies.append(c)
    assert len(companies) == 2


# ---------------------------------------------------------------------------
# Captcha tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_detect_captcha_marker_triggers_solver(monkeypatch):
    """При первой капче — пробуем solver; если он вернул токен, повторяем
    запрос с cookie и получаем нормальный HTML."""
    captcha_html = (FIXTURES / "yandex_captcha_wall.html").read_text(encoding="utf-8")
    success_html = (FIXTURES / "yandex_search_jsonld.html").read_text(encoding="utf-8")

    fetch_responses = [_make_response(captcha_html), _make_response(success_html)]
    fetch_calls: list[dict[str, Any]] = []

    async def fake_fetch(url, **kwargs):
        fetch_calls.append(kwargs)
        return fetch_responses.pop(0)

    solver_calls: list[tuple[str, str]] = []

    async def fake_solver(html, url, db):
        solver_calls.append((url, "called"))
        return "fake-smart-token"

    monkeypatch.setattr(ym, "fetch_with_retry", fake_fetch)
    monkeypatch.setattr(ym, "solve_yandex_smartcaptcha", fake_solver)

    db_mock = MagicMock()
    provider = YandexMapsProvider(db=db_mock, use_proxy=False)
    companies = [c async for c in provider.search_companies("стоматология", "Москва", limit=10)]

    assert len(companies) == 3
    assert len(solver_calls) == 1
    # второй запрос ушёл с cookie smart-token
    assert fetch_calls[1].get("cookies", {}).get("smart-token") == "fake-smart-token"


@pytest.mark.asyncio
async def test_captcha_wall_three_attempts(monkeypatch):
    """Если solver не справляется (возвращает None) трижды → CaptchaWallError."""
    captcha_html = (FIXTURES / "yandex_captcha_wall.html").read_text(encoding="utf-8")

    async def fake_fetch(url, **kwargs):
        return _make_response(captcha_html)

    async def fake_solver(html, url, db):
        return None  # solver не справился

    monkeypatch.setattr(ym, "fetch_with_retry", fake_fetch)
    monkeypatch.setattr(ym, "solve_yandex_smartcaptcha", fake_solver)

    db_mock = MagicMock()
    provider = YandexMapsProvider(db=db_mock, use_proxy=False)

    with pytest.raises(CaptchaWallError):
        async for _ in provider.search_companies("стоматология", "Москва", limit=10):
            pass


@pytest.mark.asyncio
async def test_captcha_without_db_skips_solver(monkeypatch):
    """Если db=None — solver не зовём, и капча сразу прокинет CaptchaWallError
    после MAX_CAPTCHA_ATTEMPTS попыток."""
    captcha_html = (FIXTURES / "yandex_captcha_wall.html").read_text(encoding="utf-8")

    async def fake_fetch(url, **kwargs):
        return _make_response(captcha_html)

    solver_calls: list[Any] = []

    async def fake_solver(html, url, db):
        solver_calls.append(1)
        return None

    monkeypatch.setattr(ym, "fetch_with_retry", fake_fetch)
    monkeypatch.setattr(ym, "solve_yandex_smartcaptcha", fake_solver)

    provider = YandexMapsProvider(db=None, use_proxy=False)
    with pytest.raises(CaptchaWallError):
        async for _ in provider.search_companies("стоматология", "Москва", limit=10):
            pass

    assert len(solver_calls) == 0  # solver не вызван


# ---------------------------------------------------------------------------
# fetch_reviews via AJAX tests
# ---------------------------------------------------------------------------


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
async def test_fetch_reviews_via_ajax_happy_path(monkeypatch):
    import json
    data = json.loads((FIXTURES / "yandex_fetch_reviews_response.json").read_text(encoding="utf-8"))

    def factory(url, params):
        return _make_response(
            json.dumps(data),
            status=200,
            headers={"content-type": "application/json"},
        )

    mock_client = _AsyncClientMock(factory)
    monkeypatch.setattr(ym.httpx, "AsyncClient", lambda **kw: mock_client)

    provider = YandexMapsProvider(use_proxy=False)
    reviews = [r async for r in provider.fetch_reviews("1010101010101", limit=50)]

    # 4 items в фикстуре, последний (без text+rating, без author.name) тоже идёт —
    # отличие от 2GIS: тут провайдер не отсеивает (мы решили: даже rating=None отзыв
    # сохраняется). Проверим что хотя бы первые три валидно смапились.
    assert len(reviews) >= 3
    first = reviews[0]
    assert first.source == "yandex_maps"
    assert first.external_id == "ya-rev-1001"
    assert first.author_masked == "А. П."
    assert first.rating == 5
    assert first.has_owner_reply is False
    assert isinstance(first.posted_at, datetime)
    assert first.posted_at.year == 2024

    # Второй — с ответом владельца
    second = reviews[1]
    assert second.external_id == "ya-rev-1002"
    assert second.has_owner_reply is True
    assert second.rating == 2

    # Третий — пустой author
    third = reviews[2]
    assert third.author_masked == "Аноним"
    # updated_time в миллисекундах распознан
    assert isinstance(third.posted_at, datetime)


@pytest.mark.asyncio
async def test_fetch_reviews_returns_when_non_json(monkeypatch):
    """Если content-type не json (например, прилетел HTML с капчей) — стрим завершается."""
    def factory(url, params):
        return _make_response("<html>captcha</html>", status=200, headers={"content-type": "text/html"})

    mock_client = _AsyncClientMock(factory)
    monkeypatch.setattr(ym.httpx, "AsyncClient", lambda **kw: mock_client)

    provider = YandexMapsProvider(use_proxy=False)
    reviews = [r async for r in provider.fetch_reviews("x", limit=50)]
    assert reviews == []
