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
    """Сгенерировать КП. Принимает либо company_id, либо site_lead_id (XOR).

    Возможные ошибки (понятные сообщения для UI):
      404 — компания/site-лид/шаблон не найдены.
      400 — для custom-шаблона не пришёл custom_sender_profile,
            либо передано и company_id и site_lead_id одновременно
            (валидируется в pydantic).
      503 — LLM-ассистент не настроен.
      422 — LLM дважды вернула невалидный JSON.

    Эпик A (2026-06-12): если у компании нет проанализированных болей —
    больше не бросаем 409, генерим «общее» КП по шаблону.

    Эпик F (2026-06-12): site_lead_id → ветка build_kp_prompt_for_site
    с контекстом (url + entry + entry_meaning).

    remaining_free пока всегда None — счётчик месячных лимитов
    появится в Эпике E.
    """
    try:
        if payload.site_lead_id is not None:
            result = await kp_service.generate_kp_for_site(
                db,
                user_id=user_id,
                site_lead_id=payload.site_lead_id,
                template_key=payload.template_key,
                tone=payload.tone,
                custom_sender_profile=payload.custom_sender_profile,
            )
        else:
            assert payload.company_id is not None  # гарантировано валидатором
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
        site_lead_id=result.draft_row.site_lead_id,
        template_key=result.draft_row.template_key,
        subject=result.draft_row.subject,
        body=result.draft_row.body,
        arguments_used=KpArgumentsUsed(**result.arguments_used),
        remaining_free=None,
        created_at=result.draft_row.created_at,
    )
