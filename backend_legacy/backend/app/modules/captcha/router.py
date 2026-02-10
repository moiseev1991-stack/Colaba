"""
Captcha config API: GET /captcha-config, PUT /captcha-config, POST test-2captcha, POST test-ai.
"""

from typing import Optional

import httpx
from fastapi import APIRouter, Body, Depends
from pydantic import BaseModel, Field

from app.core.dependencies import get_db, get_current_user_id, require_superuser
from app.modules.captcha import service
from app.modules.captcha.schemas import CaptchaConfigUpdate
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/captcha-config", tags=["captcha-config"])


@router.get("")
async def get_captcha_config(
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Получить конфиг обхода капчи (ai_assistant_id, external_services с замаскированными ключами)."""
    return await service.get_captcha_config(db)


@router.put("")
async def put_captcha_config(
    body: CaptchaConfigUpdate,
    _=Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Обновить конфиг. Только суперпользователь. Секреты «***» не перезаписываются."""
    kwargs = {}
    if body.ai_assistant_id is not None:
        kwargs["ai_assistant_id"] = body.ai_assistant_id
    if body.external_services is not None:
        kwargs["external_services"] = body.external_services
    return await service.upsert_captcha_config(db, **kwargs)


class Test2CaptchaBody(BaseModel):
    api_key: str | None = Field(None, description="Ключ 2captcha; если не передан — из сохранённого конфига")


@router.post("/test-2captcha")
async def test_2captcha(
    body: Optional[Test2CaptchaBody] = Body(None),
    _=Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Проверить 2captcha: запрос balance. api_key из body или из сохранённого конфига."""
    api_key = body.api_key if body and body.api_key else None
    if not api_key:
        raw = await service.get_captcha_config_raw(db)
        c2 = (raw.get("external_services") or {}).get("2captcha") or {}
        api_key = (c2.get("api_key") or "") if isinstance(c2, dict) else ""
    if not api_key or api_key == "***":
        return {"ok": False, "error": "Укажите API ключ 2captcha в настройках или в теле запроса"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get("https://2captcha.com/res.php", params={"key": api_key, "action": "getbalance", "json": 1})
            r.raise_for_status()
            data = r.json()
        if data.get("status") == 1:
            return {"ok": True, "balance": data.get("request")}
        return {"ok": False, "error": str(data.get("request", "Unknown error"))}
    except Exception as e:
        return {"ok": False, "error": str(e)}


class TestAiBody(BaseModel):
    ai_assistant_id: int | None = Field(None, description="ID AI-ассистента с vision; если не передан — из конфига")


@router.post("/test-ai")
async def test_ai(
    body: Optional[TestAiBody] = Body(None),
    _=Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Проверить AI Vision: тест на заглушке (1x1 PNG). ai_assistant_id из body или из конфига."""
    aid = body.ai_assistant_id if body and body.ai_assistant_id is not None else None
    if aid is None:
        raw = await service.get_captcha_config_raw(db)
        aid = raw.get("ai_assistant_id")
    if not aid:
        return {"ok": False, "error": "Выберите AI-ассистент с Vision в настройках или укажите ai_assistant_id"}
    # 1x1 transparent PNG
    tiny_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
    try:
        from app.modules.ai_assistants.client import vision

        out = await vision(aid, tiny_b64, "Опиши изображение в одном слове.", db)
        return {"ok": True, "reply": (out or "").strip() or "(пусто)"}
    except Exception as e:
        return {"ok": False, "error": str(e)}
