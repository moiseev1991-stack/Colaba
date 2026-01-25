"""
Сервис конфига обхода капчи: get (один конфиг на инстанс, lazy), upsert.
Секреты в external_services (api_key) маскируются при отдаче.
"""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CaptchaBypassConfig


def _mask_external_services(data: dict) -> dict:
    out = dict(data)
    for provider in ("2captcha", "anticaptcha"):
        if provider in out and isinstance(out[provider], dict):
            p = dict(out[provider])
            if p.get("api_key"):
                p["api_key"] = "***"
            out[provider] = p
    return out


async def get_captcha_config(db: AsyncSession) -> dict:
    """Один конфиг. Если строк нет — вернуть дефолт (ai_assistant_id: null, external_services: {})."""
    result = await db.execute(select(CaptchaBypassConfig).limit(1))
    row = result.scalar_one_or_none()
    if not row:
        return {"ai_assistant_id": None, "external_services": _mask_external_services({})}
    return {
        "ai_assistant_id": row.ai_assistant_id,
        "external_services": _mask_external_services(dict(row.external_services or {})),
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


async def get_captcha_config_raw(db: AsyncSession) -> dict:
    """Внутренний: конфиг без маскирования (для test-2captcha, solver)."""
    result = await db.execute(select(CaptchaBypassConfig).limit(1))
    row = result.scalar_one_or_none()
    if not row:
        return {"ai_assistant_id": None, "external_services": {}}
    return {
        "ai_assistant_id": row.ai_assistant_id,
        "external_services": dict(row.external_services or {}),
    }


async def upsert_captcha_config(
    db: AsyncSession,
    *,
    ai_assistant_id: int | None = None,
    external_services: dict | None = None,
) -> dict:
    """Обновить или создать единственный конфиг. Если передано None — поле не трогать (кроме как при создании)."""
    result = await db.execute(select(CaptchaBypassConfig).limit(1))
    row = result.scalar_one_or_none()

    if not row:
        row = CaptchaBypassConfig(
            ai_assistant_id=ai_assistant_id if ai_assistant_id is not None else None,
            external_services=dict(external_services) if external_services is not None else {},
        )
        db.add(row)
    else:
        if ai_assistant_id is not None:
            row.ai_assistant_id = ai_assistant_id
        if external_services is not None:
            # При слиянии: «***» для api_key не перезаписывать
            cur = dict(row.external_services or {})
            for prov in ("2captcha", "anticaptcha"):
                if prov in external_services and isinstance(external_services[prov], dict):
                    inc = external_services[prov]
                    cur_prov = cur.get(prov) or {}
                    if not isinstance(cur_prov, dict):
                        cur_prov = {}
                    merged = dict(cur_prov)
                    for k, v in inc.items():
                        if k == "api_key" and v in (None, "", "***"):
                            if "api_key" in merged:
                                continue
                        merged[k] = v
                    cur[prov] = merged
            row.external_services = cur
        row.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(row)
    return await get_captcha_config(db)
