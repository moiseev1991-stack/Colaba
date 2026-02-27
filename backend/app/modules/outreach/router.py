"""Outreach API router."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.router import get_current_user_id
from app.modules.outreach import schemas, service
from app.core.config import settings

router = APIRouter(prefix="/outreach", tags=["outreach"])


@router.get("/config", response_model=schemas.SmtpConfigResponse)
async def get_smtp_config(
    _user_id: int = Depends(get_current_user_id),
):
    """Return current SMTP configuration (without password)."""
    return schemas.SmtpConfigResponse(
        host=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        user=settings.SMTP_USER,
        use_ssl=settings.SMTP_USE_SSL,
        configured=service._smtp_configured(),
    )


@router.post("/send/email", status_code=status.HTTP_200_OK)
async def send_single_email(
    payload: schemas.OutreachEmailRequest,
    _user_id: int = Depends(get_current_user_id),
):
    """Send a single outreach email."""
    try:
        await service.send_email(
            to_email=payload.to_email,
            subject=payload.subject,
            body=payload.body,
            from_name=payload.from_name,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"SMTP error: {exc}")
    return {"status": "sent"}


@router.post("/send/telegram", status_code=status.HTTP_200_OK)
async def send_single_telegram(
    payload: schemas.OutreachTelegramRequest,
    _user_id: int = Depends(get_current_user_id),
):
    """Send a single message via Telegram Bot."""
    try:
        await service.send_telegram(chat_id=payload.chat_id, message=payload.message)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Telegram error: {exc}")
    return {"status": "sent"}


@router.post("/bulk", response_model=schemas.BulkOutreachResponse)
async def bulk_send(
    payload: schemas.BulkOutreachRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Send outreach to multiple search results at once."""
    try:
        result = await service.bulk_send_outreach(
            db=db,
            search_result_ids=payload.search_result_ids,
            channel=payload.channel,
            telegram_chat_id=payload.telegram_chat_id,
            from_name=payload.from_name,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return result
