"""Тесты HTTP API модуля maps.

Стиль — как в существующем tests/test_searches_api.py: ASGITransport + AsyncClient,
суперюзер-токены создаются на лету. Celery-задачи мокаются (.delay не дёргает реальный воркер).
"""

from __future__ import annotations  # noqa: только в тестах — для краткости аннотаций, не влияет на FastAPI

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.database import AsyncSessionLocal
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.user import User
from app.modules.maps import service
from app.modules.maps.schemas import CompanyRaw


async def _create_user(*, is_superuser: bool = True) -> tuple[int, dict]:
    """Создаёт юзера, возвращает (user_id, headers)."""
    async with AsyncSessionLocal() as db:
        user = User(
            email=f"maps_router_{uuid.uuid4().hex[:8]}@test.example.com",
            hashed_password=hash_password("test"),
            is_active=True,
            is_superuser=is_superuser,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        token = create_access_token(data={"sub": str(user.id)})
        return user.id, {"Authorization": f"Bearer {token}"}


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


# ---------------------------------------------------------------------------
# Public endpoints
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cities_endpoint_public():
    async with _client() as c:
        r = await c.get("/api/v1/maps/cities")
        assert r.status_code == 200
        cities = r.json()
        assert isinstance(cities, list) and len(cities) >= 20
        assert "Москва" in cities


@pytest.mark.asyncio
async def test_health_providers_public():
    async with _client() as c:
        r = await c.get("/api/v1/maps/health/providers")
        assert r.status_code == 200
        body = r.json()
        assert body["twogis"] in ("ok", "no_api_key")
        assert body["yandex_maps"] in ("ok", "no_proxy")


@pytest.mark.asyncio
async def test_niche_suggestions_filters_by_q():
    async with _client() as c:
        r = await c.get("/api/v1/maps/niche-suggestions?q=стом")
        assert r.status_code == 200
        items = r.json()
        assert all("стом" in s for s in items)


@pytest.mark.asyncio
async def test_pain_tags_returns_empty_until_ai_module():
    async with _client() as c:
        r = await c.get("/api/v1/maps/pain-tags?niche=test")
        assert r.status_code == 200
        assert r.json() == []


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_search_requires_auth():
    async with _client() as c:
        r = await c.post(
            "/api/v1/maps/search",
            json={"niche": "стоматология", "city": "Москва", "sources": ["2gis"]},
        )
        assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_get_search_unauthorized():
    async with _client() as c:
        r = await c.get("/api/v1/maps/search/1")
        assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Create + lifecycle
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_search_happy_path(monkeypatch):
    """POST /search должен создать запись и вызвать parse_map_search.delay."""
    delay_calls: list[int] = []

    # Мокаем .delay на parse_map_search ВНУТРИ router (он импортирует локально из tasks)
    from app.modules.maps import tasks as maps_tasks

    def fake_delay(search_id):
        delay_calls.append(search_id)

    monkeypatch.setattr(maps_tasks.parse_map_search, "delay", fake_delay)

    _, headers = await _create_user()
    async with _client() as c:
        r = await c.post(
            "/api/v1/maps/search",
            headers=headers,
            json={
                "niche": f"тест-{uuid.uuid4().hex[:6]}",
                "city": f"Город-{uuid.uuid4().hex[:6]}",
                "sources": ["2gis"],
            },
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["status"] == "pending"
        assert body["sources"] == "2gis"
        assert len(delay_calls) == 1
        assert delay_calls[0] == body["id"]


@pytest.mark.asyncio
async def test_create_search_invalid_niche_422():
    _, headers = await _create_user()
    async with _client() as c:
        r = await c.post(
            "/api/v1/maps/search",
            headers=headers,
            json={"niche": "x", "city": "Москва", "sources": ["2gis"]},  # niche min_length=2
        )
        assert r.status_code == 422


@pytest.mark.asyncio
async def test_other_user_cannot_access_search_403(monkeypatch):
    """Чужой поиск отдаёт 403."""
    from app.modules.maps import tasks as maps_tasks
    monkeypatch.setattr(maps_tasks.parse_map_search, "delay", lambda _: None)

    # юзер А создаёт поиск
    _, headers_a = await _create_user()
    async with _client() as c:
        r = await c.post(
            "/api/v1/maps/search",
            headers=headers_a,
            json={"niche": "test-xx", "city": "Москва", "sources": ["2gis"]},
        )
        assert r.status_code == 201
        search_id = r.json()["id"]

    # юзер Б пытается прочитать
    _, headers_b = await _create_user()
    async with _client() as c:
        r = await c.get(f"/api/v1/maps/search/{search_id}", headers=headers_b)
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# Listing / detail
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_search_companies_with_filters(monkeypatch):
    from app.modules.maps import tasks as maps_tasks
    monkeypatch.setattr(maps_tasks.parse_map_search, "delay", lambda _: None)

    user_id, headers = await _create_user()

    # Создаём поиск напрямую и кладём в него компании с разными рейтингами
    async with AsyncSessionLocal() as db:
        search = await service.create_map_search(
            db, user_id=user_id, niche=f"ниша-{uuid.uuid4().hex[:6]}", city="Москва", sources=["2gis"],
        )
        await service.save_companies_batch(db, [
            CompanyRaw(source="2gis", external_id=f"a-{uuid.uuid4().hex[:8]}", name="Low", rating=3.0, reviews_count=5),
            CompanyRaw(source="2gis", external_id=f"b-{uuid.uuid4().hex[:8]}", name="High", rating=4.7, reviews_count=20),
        ], search.id)
        search_id = search.id

    async with _client() as c:
        r = await c.get(
            f"/api/v1/maps/search/{search_id}/companies?min_rating=4&sort_by=rating_desc",
            headers=headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["total"] == 1
        assert body["items"][0]["name"] == "High"
        assert body["items"][0]["rating"] == 4.7


@pytest.mark.asyncio
async def test_get_company_detail_returns_recent_reviews(monkeypatch):
    from app.modules.maps import tasks as maps_tasks
    monkeypatch.setattr(maps_tasks.parse_map_search, "delay", lambda _: None)

    user_id, headers = await _create_user()
    from app.modules.maps.schemas import ReviewRaw

    async with AsyncSessionLocal() as db:
        search = await service.create_map_search(db, user_id=user_id, niche="x", city="y", sources=["2gis"])
        co = (await service.save_companies_batch(db, [
            CompanyRaw(source="2gis", external_id=f"c-{uuid.uuid4().hex[:8]}", name="WithReviews")
        ], search.id))[0]
        await service.save_reviews_batch(db, co.id, [
            ReviewRaw(source="2gis", rating=5, raw_text=f"good-{uuid.uuid4()}"),
            ReviewRaw(source="2gis", rating=1, raw_text=f"bad-{uuid.uuid4()}"),
        ])
        co_id = co.id

    async with _client() as c:
        r = await c.get(f"/api/v1/maps/companies/{co_id}", headers=headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["id"] == co_id
        assert body["name"] == "WithReviews"
        assert len(body["recent_reviews"]) == 2


@pytest.mark.asyncio
async def test_export_csv_returns_attachment(monkeypatch):
    """GET /export возвращает CSV-файл с заголовком + строками компаний."""
    from app.modules.maps import tasks as maps_tasks
    monkeypatch.setattr(maps_tasks.parse_map_search, "delay", lambda _: None)

    user_id, headers = await _create_user()
    async with AsyncSessionLocal() as db:
        search = await service.create_map_search(
            db, user_id=user_id, niche=_unique_id("x"), city="Москва", sources=["2gis"],
        )
        await service.save_companies_batch(db, [
            CompanyRaw(
                source="2gis", external_id=_unique_id("co"), name="Stomatology One",
                rating=4.5, reviews_count=10, phone="+74950000001",
            ),
        ], search.id)
        search_id = search.id

    async with _client() as c:
        r = await c.get(f"/api/v1/maps/search/{search_id}/export", headers=headers)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        assert "attachment" in r.headers.get("content-disposition", "")
        body = r.text
        # UTF-8 BOM в начале — Excel в RU-локали без него читает как Windows-1251.
        assert body.startswith("﻿"), "ожидается UTF-8 BOM в начале CSV"
        # Разделитель ';' — стандарт RU-локали Excel (с ',' все колонки склеиваются).
        assert "name;niche;city" in body  # заголовки CSV
        assert "Stomatology One" in body
        assert "+74950000001" in body


def _unique_id(prefix: str) -> str:
    return f"r-{prefix}-{uuid.uuid4().hex[:10]}"


@pytest.mark.asyncio
async def test_stream_endpoint_returns_200_text_event_stream():
    """После ШАГа 12 SSE-эндпоинт отвечает 200 с text/event-stream."""
    user_id, headers = await _create_user()
    async with AsyncSessionLocal() as db:
        from sqlalchemy import update
        from app.models.maps import MapSearch
        search = await service.create_map_search(db, user_id=user_id, niche="x", city="y", sources=["2gis"])
        # помечаем completed, чтобы стрим сразу закрылся после done
        await db.execute(update(MapSearch).where(MapSearch.id == search.id).values(status="completed"))
        await db.commit()
        search_id = search.id

    async with _client() as c:
        async with c.stream("GET", f"/api/v1/maps/search/{search_id}/stream", headers=headers) as r:
            assert r.status_code == 200
            ctype = r.headers.get("content-type", "")
            assert "text/event-stream" in ctype


@pytest.mark.asyncio
async def test_create_search_from_cache_enqueues_reviews_for_empty_companies(monkeypatch):
    """При cache hit роутер должен перепоставить parse_company_reviews
    для компаний, у которых нет отзывов — иначе скопированные из прошлого
    поиска карточки останутся «пустыми» в UI."""
    from datetime import datetime, timezone
    from app.modules.maps import tasks as maps_tasks

    # parse_map_search.delay не должен вызываться (это not pending case)
    map_calls: list[int] = []
    monkeypatch.setattr(
        maps_tasks.parse_map_search, "delay", lambda sid: map_calls.append(sid)
    )
    # parse_company_reviews.delay — должен быть вызван по числу пустых компаний
    review_calls: list[tuple[int, str]] = []
    monkeypatch.setattr(
        maps_tasks.parse_company_reviews, "delay",
        lambda cid, src: review_calls.append((cid, src)),
    )

    niche = _unique_id("frc")
    city = _unique_id("city")
    user_id, headers = await _create_user()

    # сидим прошлый успешный поиск с 3 компаниями (без отзывов) + кэш
    async with AsyncSessionLocal() as db:
        prev = await service.create_map_search(
            db, user_id=user_id, niche=niche, city=city, sources=["2gis"],
        )
        await service.save_companies_batch(db, [
            CompanyRaw(source="2gis", external_id=_unique_id("e1"), name="Empty1", niche=niche, city=city),
            CompanyRaw(source="2gis", external_id=_unique_id("e2"), name="Empty2", niche=niche, city=city),
            CompanyRaw(source="2gis", external_id=_unique_id("e3"), name="Empty3", niche=niche, city=city),
        ], prev.id)
        prev.status = "completed"
        prev.finished_at = datetime.now(timezone.utc)
        await db.commit()
        await service.upsert_cache_entry(db, niche, city, "2gis", companies_count=3, reviews_count=0)

    async with _client() as c:
        r = await c.post(
            "/api/v1/maps/search",
            headers=headers,
            json={"niche": niche, "city": city, "sources": ["2gis"]},
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["status"] == "from_cache"

    # parse_map_search для from_cache не должен вызываться
    assert map_calls == []
    # для каждой из 3 пустых компаний — таск на отзывы
    assert len(review_calls) == 3
    assert {src for _, src in review_calls} == {"2gis"}
