"""
CRUD и маскирование секретов для AiAssistant.
"""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AiAssistant, CaptchaBypassConfig
from app.modules.ai_assistants.registry import get_registry_entry

SECRET_KEYS = {"api_key"}


class UsedInCaptchaError(Exception):
    """AI-ассистент используется в CaptchaBypassConfig."""
    pass


def _mask_config(config: dict) -> dict:
    out = dict(config)
    for k in SECRET_KEYS:
        if k in out and out[k]:
            out[k] = "***"
    return out


def _is_configured(config: dict, provider_type: str) -> bool:
    entry = get_registry_entry(provider_type)
    if not entry:
        return bool(config.get("api_key"))
    keys = entry.get("config_keys", [])
    for k in keys:
        if k == "api_key" and (not (config.get(k) or "").strip() or config.get(k) == "***"):
            return False
        if k == "deployment_name" and entry.get("provider_type") == "azure_openai":
            if not (config.get(k) or "").strip():
                return False
    return True


async def list_ai_assistants(db: AsyncSession) -> list[dict]:
    result = await db.execute(select(AiAssistant).order_by(AiAssistant.id))
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "provider_type": r.provider_type,
            "model": r.model,
            "config": _mask_config(dict(r.config or {})),
            "supports_vision": r.supports_vision,
            "is_default": r.is_default,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in rows
    ]


async def get_ai_assistant(assistant_id: int, db: AsyncSession) -> dict | None:
    result = await db.execute(select(AiAssistant).where(AiAssistant.id == assistant_id))
    r = result.scalar_one_or_none()
    if not r:
        return None
    return {
        "id": r.id,
        "name": r.name,
        "provider_type": r.provider_type,
        "model": r.model,
        "config": _mask_config(dict(r.config or {})),
        "supports_vision": r.supports_vision,
        "is_default": r.is_default,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


async def get_ai_assistant_row(assistant_id: int, db: AsyncSession) -> AiAssistant | None:
    result = await db.execute(select(AiAssistant).where(AiAssistant.id == assistant_id))
    return result.scalar_one_or_none()


async def create_ai_assistant(
    name: str,
    provider_type: str,
    model: str,
    config: dict,
    supports_vision: bool = False,
    is_default: bool = False,
    *,
    db: AsyncSession,
) -> AiAssistant:
    if is_default:
        await _unset_default(db)
    row = AiAssistant(
        name=name,
        provider_type=provider_type,
        model=model,
        config=dict(config or {}),
        supports_vision=supports_vision,
        is_default=is_default,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def update_ai_assistant(
    assistant_id: int,
    *,
    name: str | None = None,
    provider_type: str | None = None,
    model: str | None = None,
    config: dict | None = None,
    supports_vision: bool | None = None,
    is_default: bool | None = None,
    db: AsyncSession,
) -> AiAssistant | None:
    row = await get_ai_assistant_row(assistant_id, db)
    if not row:
        return None
    if name is not None:
        row.name = name
    if provider_type is not None:
        row.provider_type = provider_type
    if model is not None:
        row.model = model
    if config is not None:
        existing = dict(row.config or {})
        for k in SECRET_KEYS:
            if config.get(k) in (None, "", "***"):
                if k in existing:
                    config = {**config, k: existing[k]}
        row.config = config
    if supports_vision is not None:
        row.supports_vision = supports_vision
    if is_default is True:
        await _unset_default(db)
        row.is_default = True
    elif is_default is False:
        row.is_default = False
    row.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return row


async def _unset_default(db: AsyncSession) -> None:
    result = await db.execute(select(AiAssistant).where(AiAssistant.is_default == True))
    for row in result.scalars().all():
        row.is_default = False
    await db.commit()


async def delete_ai_assistant(assistant_id: int, db: AsyncSession) -> bool:
    row = await get_ai_assistant_row(assistant_id, db)
    if not row:
        return False
    cap = await db.execute(select(CaptchaBypassConfig).where(CaptchaBypassConfig.ai_assistant_id == assistant_id).limit(1))
    if cap.scalar_one_or_none():
        raise UsedInCaptchaError()
    await db.delete(row)
    await db.commit()
    return True
