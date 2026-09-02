"""HTTP endpoints приёмника заявок.

  POST   /api/v1/inbound-leads        — приём заявки (бот), X-Inbound-Secret
  POST   /api/v1/inbound-leads/public — публичная форма лендинга (без секрета)
  GET    /api/v1/inbound-leads        — список (только is_superuser)
  PATCH  /api/v1/inbound-leads/{id}   — смена статуса (admin)
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_db, require_superuser
from app.core.rate_limit import limiter
from app.modules.inbound_leads import schemas, service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/inbound-leads", tags=["inbound-leads"])


async def verify_inbound_secret(x_inbound_secret: str = Header(default="")) -> None:
    """Проверяет заголовок X-Inbound-Secret.

    Если INBOUND_SECRET не задан в окружении — отвечаем 503 с понятным
    текстом (а не молча пропускаем незащищённый приём). Неверный секрет → 401.
    """
    if not settings.INBOUND_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="INBOUND_SECRET не задан на сервере — приём заявок отключён",
        )
    if x_inbound_secret != settings.INBOUND_SECRET:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid inbound secret")


@router.post(
    "",
    response_model=schemas.InboundLeadSubmitResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_inbound_lead(
    payload: schemas.InboundLeadSubmit,
    _: None = Depends(verify_inbound_secret),
    db: AsyncSession = Depends(get_db),
):
    """Единый приём заявки от бота (source=tg_bot) и формы лендинга (source=landing_form)."""
    return await service.submit_lead(db, payload)


@router.post(
    "/public",
    response_model=schemas.InboundLeadSubmitResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("5/hour")
async def create_public_inbound_lead(
    request: Request,
    payload: schemas.InboundLeadPublicSubmit,
    db: AsyncSession = Depends(get_db),
):
    """Публичный приём заявки с лендинга spinlid-team.ru — БЕЗ секрета.

    Статика не может безопасно хранить X-Inbound-Secret, поэтому защита:
      - rate-limit 5/час с IP;
      - honeypot `hp` (скрытое поле, у людей пусто);
      - обязательное согласие `consent`.
    source жёстко = landing_form. Дальше — общий service.submit_lead
    (матч компании + боли + уведомление владельцу + запись в «Заявки»).
    """
    # Honeypot: бот заполнил скрытое поле → отвечаем «успехом», ничего не пишем.
    if (payload.hp or "").strip():
        logger.info("inbound_leads: honeypot сработал, заявка отброшена")
        return schemas.InboundLeadSubmitResponse(
            id=0, status="new", matched_company_id=None, is_new=True
        )
    if not payload.consent:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Требуется согласие на обработку персональных данных",
        )
    if not (payload.company_text.strip() or payload.contact_text.strip()):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Заполните хотя бы одно поле: компанию или контакт",
        )
    internal = schemas.InboundLeadSubmit(
        source="landing_form",
        source_tag=payload.source_tag or "landing",
        name=payload.name,
        company_text=payload.company_text,
        contact_text=payload.contact_text,
    )
    return await service.submit_lead(db, internal)


@router.get("", response_model=schemas.InboundLeadListResponse)
async def list_inbound_leads(
    status_filter: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    _: object = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    items, total = await service.list_leads(
        db, status_filter=status_filter, limit=limit, offset=offset
    )
    return schemas.InboundLeadListResponse(
        items=[schemas.InboundLeadOut.model_validate(i) for i in items],
        total=total,
    )


@router.patch("/{lead_id}", response_model=schemas.InboundLeadOut)
async def patch_inbound_lead(
    lead_id: int,
    payload: schemas.InboundLeadStatusUpdate,
    _: object = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    lead = await service.update_status(db, lead_id, payload.status)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return schemas.InboundLeadOut.model_validate(lead)
