"""SSE-стрим прогресса поиска. Используется в router.stream_map_search.

Поток событий:
1. bootstrap — на старте отдаём текущее состояние БД (companies уже в этом поиске)
   как event=company с position. Если поиск уже completed — добавляем event=done и закрываем.
2. live — подписка на канал maps_stream:{search_id} через Redis. Стримим всё, что
   публикует service/tasks. На event=done закрываем.
3. heartbeat — раз в N секунд (по умолчанию settings.SSE_HEARTBEAT_INTERVAL=15)
   шлём комментарий ': hb' чтобы прокси не убил idle-соединение.

Формат SSE на проводе:
    event: <type>
    data: <json>
    \n\n
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncIterator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.redis_pubsub import maps_stream_channel, subscribe_events
from app.models.maps import Company, MapSearch, MapSearchResult

logger = logging.getLogger(__name__)


SSE_HEARTBEAT_INTERVAL = 15  # seconds. Не торчит в Settings — можно вынести позже


def _format_event(event_type: str, data: dict[str, Any]) -> str:
    """Строка одного SSE-сообщения."""
    return f"event: {event_type}\ndata: {json.dumps(data, default=str)}\n\n"


def _company_to_event(company: Company, position: int | None) -> dict[str, Any]:
    """Сериализация Company в payload event=company.

    2026-06-12: добавлено `website` — без него клиент не мог корректно
    показывать карточки live-stream'а под фильтром «Только без сайта»
    (поле было всегда undefined → safety-фильтр давал ложный результат).
    """
    return {
        "company_id": company.id,
        "name": company.name,
        "rating": float(company.rating) if company.rating is not None else None,
        "reviews_count": company.reviews_count or 0,
        "reviews_negative_count": company.reviews_negative_count or 0,
        "source": company.source,
        "position": position,
        "website": company.website,
    }


async def iter_search_events(db: AsyncSession, search: MapSearch) -> AsyncIterator[str]:
    """Главный async-генератор. Готовый к подключению к StreamingResponse."""
    channel = maps_stream_channel(search.id)

    # 1) bootstrap — уже найденные компании
    rows = list((await db.execute(
        select(Company, MapSearchResult.position)
        .join(MapSearchResult, MapSearchResult.company_id == Company.id)
        .where(MapSearchResult.map_search_id == search.id)
        .order_by(MapSearchResult.position.asc().nullslast(), Company.id.asc())
    )).all())
    for company, position in rows:
        yield _format_event("company", _company_to_event(company, position))

    # Если поиск уже закрыт — сразу done, без подписки
    if search.status in ("completed", "failed", "from_cache"):
        yield _format_event("done", {
            "status": search.status,
            "companies_found": search.companies_found or 0,
            "reviews_found": search.reviews_found or 0,
            "error": search.error,
        })
        return

    # 2) live: подписка + heartbeat. Объединяем через asyncio.wait.
    sub_iter = subscribe_events(channel).__aiter__()

    async def _next_event():
        return await sub_iter.__anext__()

    while True:
        try:
            event = await asyncio.wait_for(_next_event(), timeout=SSE_HEARTBEAT_INTERVAL)
        except asyncio.TimeoutError:
            # heartbeat — SSE comment, клиенту ничего не парсить
            yield ": hb\n\n"
            continue
        except StopAsyncIteration:
            return
        except Exception as e:
            logger.warning("sse %d: subscribe error %s", search.id, e)
            return

        ev_type = event.get("type")
        ev_data = event.get("data") or {}
        if not isinstance(ev_type, str):
            continue
        yield _format_event(ev_type, ev_data)
        if ev_type == "done":
            return
