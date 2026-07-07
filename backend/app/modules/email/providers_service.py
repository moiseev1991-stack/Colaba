"""Сервис для управления настройками email-провайдеров.

CRUD + Test connection + цепочка fallback для send_email.
Паттерн аналогичен maps/providers_settings_service.py, но для 3 каналов
отправки email (postbox/ses/hyvor) с приоритетами.

Ключевые функции:
- get_all_configs / get_provider — чтение (секреты маскируются).
- update_config — partial update с секрет-маской (*** или пусто = не трогать).
- get_status — краткий статус для бейджей в UI.
- get_active_chain — упорядоченный список включённых провайдеров для
  send_email fallback (по возрастанию priority).
- compute_is_configured — минимально-достаточный набор кредентиалов.
"""

from __future__ import annotations

import logging
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.email_provider_config import EmailProviderConfig
from app.modules.email.providers_registry import (
    EMAIL_PROVIDER_REGISTRY,
    get_all_provider_ids,
    get_registry_entry,
)

logger = logging.getLogger(__name__)

MASK = "***"

# Поля, считающиеся секретами (маскируются в API-ответе, не пишутся при
# получении значения "***" или пустой строки от клиента).
_SECRET_FIELDS = {"api_key", "secret_key", "smtp_password"}


# ────────────────────────────────────────────────────────────────────
# Чтение / запись конфигов
# ────────────────────────────────────────────────────────────────────


async def _get_or_create_row(
    db: AsyncSession, provider_id: str
) -> EmailProviderConfig:
    """Возвращает строку конфига для провайдера; создаёт если нет."""
    result = await db.execute(
        select(EmailProviderConfig).where(
            EmailProviderConfig.provider_id == provider_id
        )
    )
    row = result.scalar_one_or_none()
    if row:
        return row
    entry = get_registry_entry(provider_id) or {}
    row = EmailProviderConfig(
        provider_id=provider_id,
        priority=entry.get("default_priority", 99),
        cost_per_mail=entry.get("default_cost_per_mail", 0),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def get_all_configs(db: AsyncSession) -> list[EmailProviderConfig]:
    """Все 3 строки конфигов; создаёт недостающие."""
    rows: dict[str, EmailProviderConfig] = {}
    for pid in get_all_provider_ids():
        rows[pid] = await _get_or_create_row(db, pid)
    return [rows[pid] for pid in get_all_provider_ids()]


async def get_provider_row(
    db: AsyncSession, provider_id: str
) -> Optional[EmailProviderConfig]:
    """Одна строка по provider_id (без создания)."""
    if provider_id not in get_all_provider_ids():
        return None
    result = await db.execute(
        select(EmailProviderConfig).where(
            EmailProviderConfig.provider_id == provider_id
        )
    )
    return result.scalar_one_or_none()


def mask_value(value: Optional[str]) -> Optional[str]:
    """Маскирует секрет. Пустой → None, есть → '***'."""
    if value:
        return MASK
    return None


def row_to_dict(row: EmailProviderConfig) -> dict[str, Any]:
    """Преобразует row в dict с метаданными из реестра (для UI).

    Все секреты маскируются; cost_per_mail/priority/is_enabled передаются
    как есть (не секретны).
    """
    entry = get_registry_entry(row.provider_id) or {}
    return {
        "provider_id": row.provider_id,
        "name": entry.get("name", row.provider_id),
        "description": entry.get("description", ""),
        "fields": entry.get("fields", []),
        # Значения полей (секреты маскируются):
        "api_key": mask_value(row.api_key),
        "secret_key": mask_value(row.secret_key),
        "smtp_host": row.smtp_host,
        "smtp_port": row.smtp_port,
        "smtp_user": row.smtp_user,
        "smtp_password": mask_value(row.smtp_password),
        "smtp_use_ssl": bool(row.smtp_use_ssl),
        "from_email": row.from_email,
        "from_name": row.from_name,
        "region": row.region,
        "transport": row.transport,
        # Стоимость и статус:
        "cost_per_mail": float(row.cost_per_mail) if row.cost_per_mail is not None else 0.0,
        "is_enabled": bool(row.is_enabled),
        "is_configured": bool(row.is_configured),
        "priority": int(row.priority),
        "last_test_at": row.last_test_at,
        "last_test_result": row.last_test_result,
        "last_test_error": row.last_test_error,
    }


async def get_all_configs_public(db: AsyncSession) -> list[dict[str, Any]]:
    """Список всех конфигов с маскированными секретами для UI."""
    rows = await get_all_configs(db)
    out = [row_to_dict(r) for r in rows]
    out.sort(key=lambda x: x["priority"])
    return out


def _apply_secret_update(
    current: Optional[str], new_val: Any
) -> Optional[str]:
    """Если новое значение None/''/'***' — сохраняем старое (не перезаписываем)."""
    if new_val is None or new_val == "" or new_val == MASK:
        return current
    return str(new_val)


def _apply_plain_update(
    current: Optional[Any], new_val: Any
) -> Optional[Any]:
    """Для не-секретных полей: None = не трогать, иначе новое значение."""
    if new_val is None:
        return current
    if isinstance(new_val, str) and new_val == "":
        # Пустая строка для plain-полей — сброс в NULL (затираем).
        return None
    return new_val


def compute_is_configured(row: EmailProviderConfig) -> bool:
    """Минимально-достаточный набор кредентиалов для провайдера.

    - postbox: smtp_host + smtp_user + smtp_password + from_email.
    - ses:     smtp_host + smtp_user + smtp_password + from_email.
    - hyvor:   smtp_host (URL) + api_key.
    """
    pid = row.provider_id
    host = (row.smtp_host or "").strip()
    user = (row.smtp_user or "").strip()
    pwd = (row.smtp_password or "").strip()
    api_key = (row.api_key or "").strip()
    from_email = (row.from_email or "").strip()

    if pid == "hyvor":
        return bool(host and api_key)
    # postbox, ses — оба через SMTP.
    return bool(host and user and pwd and from_email)


async def update_config(
    db: AsyncSession, provider_id: str, data: dict[str, Any]
) -> EmailProviderConfig:
    """Partial update конфига с секрет-маской.

    Принимает dict с любым набором полей. Секретные поля (api_key,
    secret_key, smtp_password) обрабатываются через _apply_secret_update
    (значение '***' или '' = не трогать).
    """
    if provider_id not in get_all_provider_ids():
        raise ValueError(f"unknown provider_id: {provider_id!r}")

    row = await _get_or_create_row(db, provider_id)

    # Секретные поля (маска):
    if "api_key" in data:
        row.api_key = _apply_secret_update(row.api_key, data["api_key"])
    if "secret_key" in data:
        row.secret_key = _apply_secret_update(row.secret_key, data["secret_key"])
    if "smtp_password" in data:
        row.smtp_password = _apply_secret_update(row.smtp_password, data["smtp_password"])

    # Не-секретные поля (plain):
    if "smtp_host" in data:
        row.smtp_host = _apply_plain_update(row.smtp_host, data["smtp_host"])
    if "smtp_port" in data:
        port = data["smtp_port"]
        row.smtp_port = int(port) if port not in (None, "") else None
    if "smtp_user" in data:
        row.smtp_user = _apply_plain_update(row.smtp_user, data["smtp_user"])
    if "smtp_use_ssl" in data:
        row.smtp_use_ssl = bool(data["smtp_use_ssl"])
    if "from_email" in data:
        row.from_email = _apply_plain_update(row.from_email, data["from_email"])
    if "from_name" in data:
        row.from_name = _apply_plain_update(row.from_name, data["from_name"])
    if "region" in data:
        row.region = _apply_plain_update(row.region, data["region"])
    if "transport" in data:
        # Только 'smtp' или 'http', иначе игнор.
        t = str(data["transport"]).lower().strip()
        if t in ("smtp", "http"):
            row.transport = t

    # Стоимость и статус:
    if "cost_per_mail" in data:
        try:
            row.cost_per_mail = Decimal(str(data["cost_per_mail"]))
        except (ValueError, TypeError):
            pass
    if "is_enabled" in data:
        row.is_enabled = bool(data["is_enabled"])
    if "priority" in data:
        try:
            row.priority = int(data["priority"])
        except (ValueError, TypeError):
            pass
    if "notes" in data and data["notes"] is not None:
        row.notes = str(data["notes"])

    row.is_configured = compute_is_configured(row)
    row.updated_at = datetime.utcnow()

    db.add(row)
    try:
        await db.commit()
    except Exception as e:
        await db.rollback()
        # Понятное сообщение для частой ошибки: секрет слишком длинный.
        msg = str(e).lower()
        if "value too long" in msg or "stringdatarighttruncation" in msg:
            raise ValueError(
                "Одно из значений слишком длинное для БД. "
                "Проверьте, что вставляете правильный ключ/секрет "
                "(Yandex Cloud Postbox secret ~40-50 символов)."
            ) from e
        raise
    await db.refresh(row)
    return row


async def set_priority(
    db: AsyncSession, provider_id: str, priority: int
) -> EmailProviderConfig:
    """Меняет приоритет одного провайдера (0=primary, 1=fallback, 2=tertiary).

    При перестановке приоритеты других провайдеров сдвигаются так, чтобы
    остаться уникальными 0/1/2 (без дыр).
    """
    if provider_id not in get_all_provider_ids():
        raise ValueError(f"unknown provider_id: {provider_id!r}")
    priority = max(0, min(2, int(priority)))

    rows = await get_all_configs(db)
    # Убираем target из списка, сортируем остальных по приоритету.
    target = next((r for r in rows if r.provider_id == provider_id), None)
    if target is None:
        raise ValueError(f"provider row not found: {provider_id!r}")
    others = sorted(
        [r for r in rows if r.provider_id != provider_id],
        key=lambda r: r.priority,
    )
    # Target ставится на новую позицию, остальные заполняют 0..2 без дыр.
    new_order = others[:priority] + [target] + others[priority:]
    for idx, r in enumerate(new_order):
        if r.priority != idx:
            r.priority = idx
            r.updated_at = datetime.utcnow()
            db.add(r)
    await db.commit()
    await db.refresh(target)
    return target


async def get_status(db: AsyncSession) -> dict[str, str]:
    """Краткий статус каждого провайдера для бейджей UI.

    Значения: 'ok' | 'no_credentials' | 'disabled'.
    """
    rows = await get_all_configs(db)
    out: dict[str, str] = {}
    for row in rows:
        if not row.is_enabled:
            out[row.provider_id] = "disabled"
        elif row.is_configured:
            out[row.provider_id] = "ok"
        else:
            out[row.provider_id] = "no_credentials"
    return out


# ────────────────────────────────────────────────────────────────────
# Цепочка fallback для send_email
# ────────────────────────────────────────────────────────────────────


async def get_active_chain(db: AsyncSession) -> list[EmailProviderConfig]:
    """Возвращает включённые провайдеры в порядке приоритета (для fallback).

    send_email() перебирает этот список; при сбое очередного канала
    переходит к следующему.
    """
    rows = await get_all_configs(db)
    active = [r for r in rows if r.is_enabled and r.is_configured]
    active.sort(key=lambda r: r.priority)
    return active
