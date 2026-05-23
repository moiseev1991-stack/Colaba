"""Тесты SSE-стрима поиска (ШАГ 12 ТЗ).

Bootstrap тестируем чтением реального HTTP-ответа от ASGI app (компании,
загруженные в БД заранее, должны прилететь как event=company).

Forwarding из Redis — публикуем в pubsub из теста, в фоне читаем стрим.
"""

from __future__ import annotations  # noqa: только в тестах

import asyncio
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import update

from app.core.database import AsyncSessionLocal
from app.core.redis_pubsub import maps_stream_channel, publish_event
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.maps import MapSearch
from app.models.user import User
from app.modules.maps import service
from app.modules.maps.schemas import CompanyRaw


async def _create_user_with_headers():
    async with AsyncSessionLocal() as db:
        u = User(
            email=f"sse_{uuid.uuid4().hex[:8]}@t.example.com",
            hashed_password=hash_password("x"),
            is_active=True,
        )
        db.add(u)
        await db.commit()
        await db.refresh(u)
        return u.id, {"Authorization": f"Bearer {create_access_token(data={'sub': str(u.id)})}"}


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _set_status(search_id: int, status: str):
    async with AsyncSessionLocal() as db:
        await db.execute(update(MapSearch).where(MapSearch.id == search_id).values(status=status))
        await db.commit()


# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stream_emits_existing_companies_on_connect():
    """Если у поиска уже есть компании в БД (parse_map_search частично отработал),
    то на подключение SSE сразу отдаёт их как event=company. Если статус
    уже completed — добавляет event=done и закрывает стрим."""
    user_id, headers = await _create_user_with_headers()
    async with AsyncSessionLocal() as db:
        search = await service.create_map_search(
            db, user_id=user_id, niche="x", city="y", sources=["2gis"],
        )
        await service.save_companies_batch(db, [
            CompanyRaw(source="2gis", external_id=f"sse-a-{uuid.uuid4().hex[:8]}", name="Alpha"),
            CompanyRaw(source="2gis", external_id=f"sse-b-{uuid.uuid4().hex[:8]}", name="Bravo"),
        ], search.id)
        sid = search.id
    # помечаем completed, чтобы стрим завершился сам
    await _set_status(sid, "completed")

    async with _client() as c:
        async with c.stream("GET", f"/api/v1/maps/search/{sid}/stream", headers=headers, timeout=10.0) as r:
            assert r.status_code == 200
            chunks = []
            async for chunk in r.aiter_text():
                chunks.append(chunk)
            blob = "".join(chunks)

    # Должны быть 2 event=company и затем event=done
    assert blob.count("event: company\n") == 2
    assert "Alpha" in blob and "Bravo" in blob
    assert "event: done\n" in blob


# ---------------------------------------------------------------------------
# Forwarding pub/sub
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stream_forwards_pubsub_events_and_closes_on_done():
    user_id, headers = await _create_user_with_headers()
    async with AsyncSessionLocal() as db:
        search = await service.create_map_search(
            db, user_id=user_id, niche="x", city="y", sources=["2gis"],
        )
        # status остаётся 'pending' — стрим перейдёт в подписку
        sid = search.id

    async def _publisher_after_delay():
        # даём субскрайберу проснуться
        await asyncio.sleep(0.5)
        channel = maps_stream_channel(sid)
        await publish_event(channel, "company", {"company_id": 999, "name": "FromPubSub", "position": 0})
        await publish_event(channel, "progress", {"stage": "parsing", "processed": 1, "total": 1})
        await publish_event(channel, "done", {"companies_found": 1, "reviews_found": 0})

    publisher_task = asyncio.create_task(_publisher_after_delay())

    async with _client() as c:
        async with c.stream("GET", f"/api/v1/maps/search/{sid}/stream", headers=headers, timeout=10.0) as r:
            assert r.status_code == 200
            collected = ""
            async for chunk in r.aiter_text():
                collected += chunk
                if "event: done" in collected:
                    break

    await publisher_task
    assert "FromPubSub" in collected
    assert "event: progress\n" in collected
    assert "event: done\n" in collected


# ---------------------------------------------------------------------------
# Auth / ownership
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stream_returns_403_for_other_user():
    # юзер А создаёт поиск
    user_a, _ = await _create_user_with_headers()
    async with AsyncSessionLocal() as db:
        search = await service.create_map_search(
            db, user_id=user_a, niche="x", city="y", sources=["2gis"],
        )
        sid = search.id

    # юзер Б пытается читать стрим
    _, headers_b = await _create_user_with_headers()
    async with _client() as c:
        # без stream — обычный GET, ожидаем 403 в headers сразу
        r = await c.get(f"/api/v1/maps/search/{sid}/stream", headers=headers_b)
        assert r.status_code == 403
