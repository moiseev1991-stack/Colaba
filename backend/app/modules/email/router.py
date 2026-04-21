"""Email router for Hyvor Relay webhooks and email API."""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings as app_settings
from app.core.database import get_db
from app.models.email_config import EmailConfig
from app.modules.email import email_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/email", tags=["email"])


# Webhook event schemas
class HyvorWebhookEvent(BaseModel):
    """Hyvor Relay webhook event payload."""
    event: str = Field(..., description="Event type: sent, delivered, bounced, opened, clicked, spam")
    message_id: str = Field(..., description="External message ID from Hyvor")
    timestamp: str = Field(..., description="ISO timestamp of the event")
    recipient: Optional[str] = Field(None, description="Recipient email address")
    bounce_reason: Optional[str] = Field(None, description="Bounce reason if bounced")
    url: Optional[str] = Field(None, description="Clicked URL if clicked event")
    user_agent: Optional[str] = Field(None, description="User agent for opened/clicked events")


@router.post("/webhooks/hyvor")
async def hyvor_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Handle webhook events from Hyvor Relay.
    
    Events: sent, delivered, bounced, opened, clicked, spam
    """
    body = await request.body()

    signature = request.headers.get("X-Hyvor-Signature", "")

    cfg = await db.execute(select(EmailConfig).where(EmailConfig.id == 1))
    cfg_row = cfg.scalar_one_or_none()
    wh_secret = (
        (cfg_row.hyvor_webhook_secret if cfg_row and cfg_row.hyvor_webhook_secret else None)
        or app_settings.HYVOR_RELAY_WEBHOOK_SECRET
    )

    if not email_service.verify_webhook_signature(
        body, signature, secret_override=wh_secret or None
    ):
        logger.warning("Invalid webhook signature")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid signature",
        )

    try:
        payload = json.loads(body.decode("utf-8"))
    except Exception as e:
        logger.error(f"Failed to parse webhook payload: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload",
        )
    
    event_type = payload.get("event")
    if not event_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing event type"
        )
    
    logger.info(f"Received Hyvor webhook: {event_type}")
    
    # Process the event
    try:
        log = await email_service.process_webhook_event(
            db=db,
            event_type=event_type,
            data=payload,
        )
        
        if log:
            logger.info(f"Updated EmailLog {log.id} status to {log.status}")
        
        return {"status": "ok", "event": event_type}
    
    except Exception as e:
        logger.error(f"Failed to process webhook event: {e}")
        # Return 200 anyway to prevent Hyvor from retrying
        return {"status": "error", "message": str(e)}


# Health check endpoint
@router.get("/health")
async def email_health():
    """Check email service health."""
    return {
        "hyvor_enabled": email_service.enabled,
        "hyvor_configured": bool(email_service.api_key),
    }
