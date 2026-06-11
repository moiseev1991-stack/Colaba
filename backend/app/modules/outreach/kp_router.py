"""Роутер KP-конвейера (Эпик A фокус-релиза «КП-конвейер»).

Эндпоинты подмонтированы под /outreach/kp/* в `outreach.router`.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.router import get_current_user_id
from app.modules.outreach import kp_service
from app.modules.outreach.kp_schemas import (
    KpArgumentsUsed,
    KpDraftOut,
    KpGenerateRequest,
    KpTemplateOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/kp", tags=["outreach-kp"])


@router.get("/templates", response_model=list[KpTemplateOut])
async def list_templates(
    _user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[KpTemplateOut]:
    """Список шаблонов КП для селекта в модалке.

    На MVP отдаём только системные (webstudio / seo / marketing / custom).
    На будущее сюда подмешаются организационные kp_templates.
    """
    rows = await kp_service.list_kp_templates(db)
    return [KpTemplateOut.model_validate(r) for r in rows]


@router.post("/generate", response_model=KpDraftOut)
async def generate_kp(
    payload: KpGenerateRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> KpDraftOut:
    """Сгенерировать КП под конкретную компанию + шаблон.

    Возможные ошибки (понятные сообщения для UI):
      404 — компания/шаблон не найдены.
      400 — для custom-шаблона не пришёл custom_sender_profile.
      409 — у компании нет проанализированных болей с цитатой
            (нужен AI-анализ отзывов).
      503 — LLM-ассистент не настроен.
      422 — LLM дважды вернула невалидный JSON.

    remaining_free пока всегда None — счётчик месячных лимитов
    появится в Эпике E.
    """
    try:
        result = await kp_service.generate_kp(
            db,
            user_id=user_id,
            company_id=payload.company_id,
            template_key=payload.template_key,
            tone=payload.tone,
            custom_sender_profile=payload.custom_sender_profile,
        )
    except kp_service.KpGenerationError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)

    return KpDraftOut(
        id=result.draft_row.id,
        company_id=result.draft_row.company_id,
        template_key=result.draft_row.template_key,
        subject=result.draft_row.subject,
        body=result.draft_row.body,
        arguments_used=KpArgumentsUsed(**result.arguments_used),
        remaining_free=None,
        created_at=result.draft_row.created_at,
    )
