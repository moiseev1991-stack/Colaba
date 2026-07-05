"""Сервис для управления настройками каналов рассылки (telegram/whatsapp/max).

CRUD + Test connection. По образцу maps/providers_settings_service.py и
email/providers_service.py. Singleton-per-channel_id, конфиги в JSONB
(гибко под разные каналы).

Test connection:
- telegram → telegram_bot.get_bot_info() (GET /getMe).
- whatsapp → greenapi /getInstanceState (если есть creds) или проверка is_configured.
- max      → заглушка (return ok:false с понятным сообщением).
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.channel_config import ChannelConfig

logger = logging.getLogger(__name__)

MASK = "***"
SUPPORTED_CHANNEL_IDS = ("telegram", "whatsapp", "max")


# Метаданные каналов для UI (аналог maps_providers_registry).
CHANNEL_REGISTRY: dict[str, dict[str, Any]] = {
    "telegram": {
        "name": "Telegram",
        "description": (
            "Warm-канал: бот отправляет КП только тем, кто сам нажал /start. "
            "Бот НЕ может писать cold-лидам первым (ограничение Bot API). "
            "Получите токен у @BotFather, затем настройте webhook."
        ),
        "secret_fields": ("bot_token",),
        "fields": [
            {"key": "bot_token", "label": "Bot token", "type": "secret", "required": True,
             "description": "От @BotFather в Telegram (например 123456:ABC-DEF1234...)."},
            {"key": "bot_username", "label": "@username бота", "type": "text", "required": False,
             "description": "Например @colaba_kp_bot (без @)."},
            {"key": "welcome_message", "label": "Welcome-сообщение", "type": "text", "required": False,
             "description": "Что увидит лид после /start (по умолчанию системное)."},
            {"key": "cost_per_message", "label": "Цена за сообщение (₽)", "type": "number", "required": False,
             "description": "Bot API бесплатный; ставьте 0 или себестоимость."},
        ],
    },
    "whatsapp": {
        "name": "WhatsApp (GreenAPI)",
        "description": (
            "Неофициальный WhatsApp Business API через Green-API. РФ-номера, "
            "cold-DM (как обычный аккаунт). Риск блокировки — обязателен "
            "warm-up номера. Тариф Developer ~1500₽/мес."
        ),
        "secret_fields": ("api_token",),
        "fields": [
            {"key": "api_url", "label": "API URL", "type": "text", "required": True,
             "default": "https://api.green-api.com", "description": "По умолчанию https://api.green-api.com."},
            {"key": "instance_id", "label": "Instance ID", "type": "text", "required": True,
             "description": "Из личного кабинета Green-API (например 1101000000)."},
            {"key": "api_token", "label": "API token", "type": "secret", "required": True,
             "description": "Из личного кабинета Green-API."},
            {"key": "cost_per_message", "label": "Цена за сообщение (₽)", "type": "number", "required": False,
             "description": "Себестоимость одного сообщения для учёта расходов."},
        ],
    },
    "max": {
        "name": "MAX",
        "description": (
            "Российский мессенджер от VK. Публичного API для рассылок пока "
            "нет (ожидается Q1-Q2 2026). Канал помечен как coming-soon, "
            "отправка КП через него сейчас невозможна (skipped)."
        ),
        "secret_fields": (),
        "fields": [
            {"key": "cost_per_message", "label": "Цена за сообщение (₽)", "type": "number", "required": False,
             "description": "Задел под будущее, когда появится API."},
        ],
    },
}


# ────────────────────────────────────────────────────────────────────
# Чтение / запись
# ────────────────────────────────────────────────────────────────────


async def _get_or_create_row(
    db: AsyncSession, channel_id: str
) -> ChannelConfig:
    """Возвращает строку конфига; создаёт если нет (с дефолтами)."""
    result = await db.execute(
        select(ChannelConfig).where(ChannelConfig.channel_id == channel_id)
    )
    row = result.scalar_one_or_none()
    if row:
        return row
    row = ChannelConfig(
        channel_id=channel_id,
        config={},
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def get_all_channels(db: AsyncSession) -> list[ChannelConfig]:
    rows: dict[str, ChannelConfig] = {}
    for cid in SUPPORTED_CHANNEL_IDS:
        rows[cid] = await _get_or_create_row(db, cid)
    return [rows[cid] for cid in SUPPORTED_CHANNEL_IDS]


async def get_channel_row(
    db: AsyncSession, channel_id: str
) -> Optional[ChannelConfig]:
    if channel_id not in SUPPORTED_CHANNEL_IDS:
        return None
    return await _get_or_create_row(db, channel_id)


def _mask_secret(value: Optional[str]) -> Optional[str]:
    if value:
        return MASK
    return None


def _mask_config(channel_id: str, config: dict) -> dict:
    """Маскирует секретные поля в config для отдачи в UI."""
    if not config:
        return {}
    secret_fields = CHANNEL_REGISTRY.get(channel_id, {}).get("secret_fields", ())
    out = dict(config)
    for k in secret_fields:
        if k in out and out[k]:
            out[k] = MASK
    return out


def row_to_dict(row: ChannelConfig) -> dict[str, Any]:
    """Преобразует row в dict с метаданными (для UI)."""
    entry = CHANNEL_REGISTRY.get(row.channel_id, {})
    return {
        "channel_id": row.channel_id,
        "name": entry.get("name", row.channel_id),
        "description": entry.get("description", ""),
        "fields": entry.get("fields", []),
        "config": _mask_config(row.channel_id, row.config or {}),
        "enabled": bool(row.enabled),
        "is_configured": bool(row.is_configured),
        "last_test_at": row.last_test_at,
        "last_test_result": row.last_test_result,
        "last_test_error": row.last_test_error,
    }


async def get_all_channels_public(db: AsyncSession) -> list[dict[str, Any]]:
    return [row_to_dict(r) for r in await get_all_channels(db)]


def _apply_secret_update(current: Optional[str], new_val: Any) -> Optional[str]:
    if new_val is None or new_val == "" or new_val == MASK:
        return current
    return str(new_val)


def _compute_is_configured(channel_id: str, config: dict) -> bool:
    """Минимально-достаточные кредентиалы по каналу."""
    cfg = config or {}
    if channel_id == "telegram":
        return bool((cfg.get("bot_token") or "").strip())
    if channel_id == "whatsapp":
        return bool(
            (cfg.get("instance_id") or "").strip()
            and (cfg.get("api_token") or "").strip()
        )
    if channel_id == "max":
        return False  # API нет, всегда «не настроен»
    return False


async def update_channel(
    db: AsyncSession, channel_id: str, data: dict[str, Any]
) -> ChannelConfig:
    """Partial update конфига канала.

    Принимает {config: {...}, enabled: bool, ...}. В config секретные поля
    обрабатываются через _apply_secret_update (*** или пусто = не трогать).
    """
    if channel_id not in SUPPORTED_CHANNEL_IDS:
        raise ValueError(f"unknown channel_id: {channel_id!r}")

    row = await _get_or_create_row(db, channel_id)
    config = dict(row.config or {})
    secret_fields = CHANNEL_REGISTRY.get(channel_id, {}).get("secret_fields", ())

    new_config = data.get("config")
    if isinstance(new_config, dict):
        for k, v in new_config.items():
            if k in secret_fields:
                config[k] = _apply_secret_update(config.get(k), v)
            else:
                # Пустые строки для не-секретных полей — затираем.
                config[k] = v if v != "" else None

    if "enabled" in data:
        row.enabled = bool(data["enabled"])

    row.config = config
    row.is_configured = _compute_is_configured(channel_id, config)
    row.updated_at = datetime.utcnow()

    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def get_status(db: AsyncSession) -> dict[str, str]:
    """Краткий статус каждого канала: 'ok' | 'no_credentials' | 'disabled'."""
    rows = await get_all_channels(db)
    out: dict[str, str] = {}
    for row in rows:
        if not row.enabled:
            out[row.channel_id] = "disabled"
        elif row.is_configured:
            out[row.channel_id] = "ok"
        else:
            out[row.channel_id] = "no_credentials"
    return out


# ────────────────────────────────────────────────────────────────────
# Тест подключения
# ────────────────────────────────────────────────────────────────────


async def test_channel(db: AsyncSession, channel_id: str) -> dict[str, Any]:
    """Реальный тест подключения канала.

    Возвращает {ok, error?}. Записывает last_test_* в строку конфига.
    """
    if channel_id not in SUPPORTED_CHANNEL_IDS:
        raise ValueError(f"unknown channel_id: {channel_id!r}")
    row = await _get_or_create_row(db, channel_id)

    try:
        if channel_id == "telegram":
            ok, err = await _test_telegram(row)
        elif channel_id == "whatsapp":
            ok, err = await _test_whatsapp(row)
        else:  # max
            ok, err = False, "Публичного API у MAX пока нет (ожидается Q1-Q2 2026)"
    except Exception as e:
        ok, err = False, str(e)[:300]

    row.last_test_at = datetime.utcnow()
    row.last_test_result = "ok" if ok else "error"
    row.last_test_error = None if ok else (err or "unknown")[:500]
    db.add(row)
    await db.commit()
    return {"ok": ok, "error": err if not ok else None}


async def _test_telegram(row: ChannelConfig) -> tuple[bool, Optional[str]]:
    """Тест Telegram: getMe. Берёт токен из БД-config или env."""
    from app.modules.outreach import telegram_bot

    # Если в config есть bot_token — временно подсунем его в env через патч.
    # telegram_bot._get_bot_token_sync читает env, поэтому при наличии
    # конфига в БД — всё равно работает (там есть fallback на БД).
    try:
        info = await telegram_bot.get_bot_info()
        result = info.get("result") or {}
        username = result.get("username", "?")
        return True, f"@{username}"
    except telegram_bot.TelegramSendError as e:
        return False, f"{e.code}: {e.message}"
    except Exception as e:
        return False, str(e)[:200]


async def _test_whatsapp(row: ChannelConfig) -> tuple[bool, Optional[str]]:
    """Тест WhatsApp GreenAPI: getInstanceState по кредентиалам."""
    import httpx

    cfg = row.config or {}
    api_url = (cfg.get("api_url") or "").strip().rstrip("/")
    instance_id = (cfg.get("instance_id") or "").strip()
    api_token = (cfg.get("api_token") or "").strip()

    if not (api_url and instance_id and api_token):
        return False, "Заполните api_url, instance_id и api_token"
    url = f"{api_url}/waInstance{instance_id}/getInstanceState/{api_token}"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(url)
            if r.status_code == 200:
                data = r.json()
                state = data.get("stateInstance") or data.get("state") or "ok"
                return True, f"state: {state}"
            return False, f"HTTP {r.status_code}: {r.text[:200]}"
    except httpx.HTTPError as e:
        return False, f"network: {e}"
