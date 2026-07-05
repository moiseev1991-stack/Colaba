"""Telegram Bot API клиент для канала Telegram в KP-send.

Bot API (https://core.telegram.org/bots/api) — официальный способ отправлять
сообщения от имени бота. ВАЖНО: бот НЕ может написать пользователю первым,
пока тот сам не инициировал чат командой /start. Это warm-channel — шлём
только тем, кто уже в боте (записан в telegram_subscribers).

Конфиг читается из channel_config (telegram.config.bot_token) с fallback на
env TELEGRAM_BOT_TOKEN (используется также OAuth Login Widget). Если пусто —
is_configured() → False и enqueue пишет skipped(telegram_not_configured).
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT_SEC = 15
TG_API_BASE = "https://api.telegram.org"


class TelegramSendError(Exception):
    """Ошибка отправки Telegram с человекочитаемым сообщением.

    Соответствует error_code в KpSend.error_code:
      - 'not_configured'  — bot_token не задан
      - 'invalid_chat_id' — chat_id пустой или невалидный
      - 'http_error'      — HTTP-ошибка от Bot API (4xx/5xx)
      - 'forbidden'       — 403: юзер остановил бота (не нажимал /start)
      - 'no_message_id'   — Bot API ответил 200, но без message_id
      - 'network_error'   — таймаут / DNS / прочее
    """

    def __init__(self, message: str, *, code: str = "send_failed") -> None:
        super().__init__(message)
        self.message = message
        self.code = code


def _get_bot_token_sync() -> str:
    """Синхронно читает bot_token: сначала env, потом БД-таблица channel_config.

    Bot API token нужен до отправки сообщения (celery sync-context). env
    TELEGRAM_BOT_TOKEN — первичный источник (как было раньше для OAuth).
    """
    token = (settings.TELEGRAM_BOT_TOKEN or "").strip()
    if token:
        return token
    # Fallback: синхронное чтение из channel_config (если админ задал через UI).
    try:
        from app.core.database import get_sync_session_factory
        from app.models.channel_config import ChannelConfig

        factory = get_sync_session_factory()
        with factory() as db:
            row = (
                db.query(ChannelConfig)
                .filter(ChannelConfig.channel_id == "telegram")
                .first()
            )
            if row and row.config:
                return str(row.config.get("bot_token") or "").strip()
    except Exception as e:
        logger.warning("telegram_bot: DB read of bot_token failed: %s", e)
    return ""


def is_configured() -> bool:
    """True если bot_token задан (env или БД). False → skipped(telegram_not_configured)."""
    return bool(_get_bot_token_sync())


async def get_bot_info() -> dict[str, Any]:
    """GET /getMe — для теста подключения. Возвращает {ok, result: {username, first_name, ...}}.

    Поднимает TelegramSendError('not_configured') если нет токена.
    """
    token = _get_bot_token_sync()
    if not token:
        raise TelegramSendError("TELEGRAM_BOT_TOKEN не задан", code="not_configured")
    url = f"{TG_API_BASE}/bot{token}/getMe"
    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SEC) as client:
            r = await client.get(url)
            data = r.json()
        if not data.get("ok"):
            raise TelegramSendError(
                f"getMe failed: {data.get('description', 'unknown')}", code="http_error"
            )
        return data
    except httpx.HTTPError as e:
        raise TelegramSendError(f"network: {e}", code="network_error") from e


async def send_text_message(
    chat_id: int | str,
    text: str,
    *,
    parse_mode: str = "HTML",
    timeout: float = DEFAULT_TIMEOUT_SEC,
) -> str:
    """Шлёт одно текстовое Telegram-сообщение через Bot API.

    Возвращает message_id (как строку — унификация с WhatsApp) → пишется
    в KpSend.provider_message_id.

    parse_mode='HTML' — позволяет использовать <b>, <i>, <a href>. Текст
    должен быть HTML-escaped (caller ответственен).

    Подымает TelegramSendError с понятным кодом.
    """
    token = _get_bot_token_sync()
    if not token:
        raise TelegramSendError("TELEGRAM_BOT_TOKEN не задан", code="not_configured")
    if chat_id in (None, "", 0):
        raise TelegramSendError("chat_id пустой", code="invalid_chat_id")

    # Telegram лимит — 4096 символов на сообщение. С запасом режем на 4000.
    truncated = text[:4000] if len(text) > 4000 else text

    url = f"{TG_API_BASE}/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": truncated,
        "parse_mode": parse_mode,
    }
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(url, json=payload)
            data = r.json()
    except httpx.HTTPError as e:
        raise TelegramSendError(f"network: {e}", code="network_error") from e

    # Bot API всегда возвращает 200 OK с {ok: bool, ...}. error_code в data.
    if not data.get("ok"):
        err_code = data.get("error_code")
        desc = data.get("description", "unknown")
        # 403 Forbidden: юзер остановил бота / не стартовал.
        if err_code == 403:
            raise TelegramSendError(
                f"forbidden: {desc} (юзер не запускал бота или остановил его)",
                code="forbidden",
            )
        if err_code == 400 and "chat not found" in desc.lower():
            raise TelegramSendError(
                f"invalid chat_id: {desc}", code="invalid_chat_id"
            )
        raise TelegramSendError(
            f"send failed ({err_code}): {desc}", code="http_error"
        )

    result = data.get("result") or {}
    message_id = result.get("message_id")
    if message_id is None:
        raise TelegramSendError("Bot API вернул ok, но без message_id", code="no_message_id")
    return str(message_id)


async def setup_webhook(public_url: str) -> dict[str, Any]:
    """Устанавливает webhook на бота: Telegram будет POSTить Updates на
    {public_url}/api/v1/telegram/webhook. public_url должен быть HTTPS.

    Возвращает ответ setWebhook.
    """
    token = _get_bot_token_sync()
    if not token:
        raise TelegramSendError("TELEGRAM_BOT_TOKEN не задан", code="not_configured")
    webhook_url = f"{public_url.rstrip('/')}/api/v1/telegram/webhook"
    url = f"{TG_API_BASE}/bot{token}/setWebhook"
    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SEC) as client:
            r = await client.post(url, json={"url": webhook_url})
            return r.json()
    except httpx.HTTPError as e:
        raise TelegramSendError(f"network: {e}", code="network_error") from e


async def delete_webhook() -> dict[str, Any]:
    """Удаляет webhook (для перехода на getUpdates long-polling)."""
    token = _get_bot_token_sync()
    if not token:
        raise TelegramSendError("TELEGRAM_BOT_TOKEN не задан", code="not_configured")
    url = f"{TG_API_BASE}/bot{token}/deleteWebhook"
    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SEC) as client:
            r = await client.post(url, json={"drop_pending_updates": True})
            return r.json()
    except httpx.HTTPError as e:
        raise TelegramSendError(f"network: {e}", code="network_error") from e


def mask_token(token: Optional[str]) -> str:
    """Маскирует bot_token для UI: первые 5 и последние 4 символа."""
    if not token:
        return ""
    if len(token) <= 12:
        return "***"
    return f"{token[:5]}...{token[-4:]}"
