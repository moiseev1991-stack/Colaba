"""Простая обёртка над Redis pub/sub для модуля maps SSE.

publish_event(channel, type, data) — публикация одного события (JSON-сообщение).
subscribe_events(channel) — async-генератор по сообщениям канала.

Канал для maps: 'maps_stream:{search_id}'.

NB: модуль аккуратен к недоступному Redis. publish_event при ошибке логирует
и идёт дальше — это не критическая операция (SSE-клиент просто не увидит
конкретного промежуточного события, но parse продолжится).
"""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator

import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger(__name__)


def get_redis() -> aioredis.Redis:
    """Возвращает aioredis-клиент. decode_responses=True даёт сразу строки."""
    return aioredis.from_url(settings.REDIS_URL, decode_responses=True)


async def publish_event(channel: str, event_type: str, data: dict[str, Any]) -> None:
    """Публикует JSON {"type": event_type, "data": data} в Redis-канал.

    Глушит ошибки сети — Redis недоступен не должен ронять основной парсинг.
    """
    msg = json.dumps({"type": event_type, "data": data}, default=str)
    try:
        r = get_redis()
        try:
            await r.publish(channel, msg)
        finally:
            await r.aclose()
    except Exception as e:
        logger.warning("redis_pubsub.publish_event(%s): %s", channel, e)


async def subscribe_events(channel: str) -> AsyncIterator[dict[str, Any]]:
    """Async-итератор по сообщениям канала. Каждое сообщение — dict {type, data}.

    Завершается при отключении/закрытии клиента (по выходу async for из стрима
    в SSE-эндпоинте, например).
    """
    r = get_redis()
    pubsub = r.pubsub()
    try:
        await pubsub.subscribe(channel)
        async for msg in pubsub.listen():
            if msg is None:
                continue
            if msg.get("type") != "message":
                continue
            payload = msg.get("data")
            if payload is None:
                continue
            try:
                yield json.loads(payload)
            except (ValueError, TypeError) as e:
                logger.warning("redis_pubsub.subscribe_events: bad JSON in %s: %s", channel, e)
                continue
    finally:
        try:
            await pubsub.unsubscribe(channel)
        except Exception:
            pass
        try:
            await pubsub.aclose()
        except Exception:
            pass
        try:
            await r.aclose()
        except Exception:
            pass


def maps_stream_channel(search_id: int) -> str:
    """Канонический канал для прогресса поиска."""
    return f"maps_stream:{search_id}"
