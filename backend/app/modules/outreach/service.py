"""Outreach sending service — email (SMTP/Hyvor Relay) and Telegram."""

import logging
from datetime import datetime
from typing import Optional

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.email.service import EmailServiceError, email_service
from app.modules.outreach.schemas import OutreachResult

logger = logging.getLogger(__name__)


def _telegram_configured() -> bool:
    return bool(settings.TELEGRAM_BOT_TOKEN)


async def send_email(
    to_email: str,
    subject: str,
    body: str,
    from_name: Optional[str] = None,
    from_email: Optional[str] = None,
    reply_to: Optional[str] = None,
    db: Optional[AsyncSession] = None,
) -> dict:
    """
    Send email via ``EmailService`` (DB ``email_config`` or env).
    """
    try:
        return await email_service.send_email(
            to_email=to_email,
            subject=subject,
            body=body,
            from_email=from_email or settings.SMTP_USER,
            from_name=from_name,
            reply_to=reply_to,
            db=db,
        )
    except EmailServiceError as e:
        raise RuntimeError(str(e)) from e


async def send_telegram(chat_id: str, message: str) -> None:
    """Send message via Telegram Bot API.  Raises on failure."""
    if not _telegram_configured():
        raise RuntimeError(
            "Telegram Bot не настроен. Укажите TELEGRAM_BOT_TOKEN в переменных окружения."
        )
    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, json={"chat_id": chat_id, "text": message, "parse_mode": "HTML"})
        resp.raise_for_status()


async def bulk_send_outreach(
    db,
    search_result_ids: list[int],
    channel: str,
    telegram_chat_id: Optional[str],
    from_name: Optional[str],
    user_id: Optional[int] = None,
    create_campaign: bool = True,
) -> dict:
    """
    Send outreach to a list of SearchResult IDs. Reads outreach text from DB.
    Optionally creates EmailCampaign and EmailLog records for tracking.
    """
    from sqlalchemy import select
    from app.models.search import SearchResult
    from app.models.email import EmailCampaign, EmailLog, CampaignStatus, EmailStatus

    result = await db.execute(
        select(SearchResult).where(SearchResult.id.in_(search_result_ids))
    )
    results = result.scalars().all()

    sent = 0
    skipped = 0
    errors = 0
    detail: list[OutreachResult] = []

    # Create campaign if tracking is enabled
    campaign = None
    if create_campaign and channel == "email" and user_id:
        campaign = EmailCampaign(
            user_id=user_id,
            name=f"Outreach {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}",
            subject="Коммерческое предложение",
            body="",
            status=CampaignStatus.SENDING,
            total_recipients=len(results),
            from_name=from_name,
        )
        db.add(campaign)
        await db.flush()  # Get campaign.id

    for sr in results:
        rid = sr.id
        if channel == "email":
            if not sr.email:
                detail.append(OutreachResult(search_result_id=rid, status="skipped", reason="no email"))
                skipped += 1
                continue
            if not sr.outreach_text:
                detail.append(OutreachResult(search_result_id=rid, status="skipped", reason="no outreach text"))
                skipped += 1
                continue

            # Create email log for tracking
            email_log = None
            if campaign:
                email_log = EmailLog(
                    campaign_id=campaign.id,
                    search_result_id=sr.id,
                    user_id=user_id,
                    organization_id=sr.search.organization_id if sr.search else None,
                    to_email=sr.email,
                    subject=sr.outreach_subject or "Коммерческое предложение",
                    status=EmailStatus.PENDING,
                )
                db.add(email_log)
                await db.flush()

            try:
                send_result = await send_email(
                    to_email=sr.email,
                    subject=sr.outreach_subject or "Коммерческое предложение",
                    body=sr.outreach_text,
                    from_name=from_name,
                    db=db,
                )
                
                # Update log on success
                if email_log:
                    email_log.status = EmailStatus.SENT
                    email_log.sent_at = datetime.utcnow()
                    email_log.external_message_id = send_result.get("external_message_id")
                    email_log.body_preview = sr.outreach_text[:500] if sr.outreach_text else None
                    db.add(email_log)
                
                detail.append(OutreachResult(search_result_id=rid, status="sent"))
                sent += 1
            except Exception as exc:
                logger.warning(f"Failed to send email to {sr.email}: {exc}")
                
                # Update log on error
                if email_log:
                    email_log.status = EmailStatus.FAILED
                    email_log.error_message = str(exc)
                    email_log.error_code = "SEND_FAILED"
                    db.add(email_log)
                
                detail.append(OutreachResult(search_result_id=rid, status="error", reason=str(exc)))
                errors += 1

        elif channel == "telegram":
            if not telegram_chat_id:
                detail.append(OutreachResult(search_result_id=rid, status="skipped", reason="no chat_id"))
                skipped += 1
                continue
            if not sr.outreach_text:
                detail.append(OutreachResult(search_result_id=rid, status="skipped", reason="no outreach text"))
                skipped += 1
                continue
            text = (
                f"<b>{sr.domain or sr.url}</b>\n\n"
                f"{sr.outreach_text}\n\n"
                f"{'📞 ' + sr.phone if sr.phone else ''}"
                f"{'  ✉️ ' + sr.email if sr.email else ''}"
            ).strip()
            try:
                await send_telegram(telegram_chat_id, text)
                detail.append(OutreachResult(search_result_id=rid, status="sent"))
                sent += 1
            except Exception as exc:
                logger.warning(f"Failed to send Telegram to {telegram_chat_id}: {exc}")
                detail.append(OutreachResult(search_result_id=rid, status="error", reason=str(exc)))
                errors += 1
        else:
            detail.append(OutreachResult(search_result_id=rid, status="skipped", reason=f"unknown channel: {channel}"))
            skipped += 1

    # Finalize campaign
    if campaign:
        campaign.sent_count = sent
        campaign.failed_count = errors
        campaign.status = CampaignStatus.COMPLETED
        campaign.completed_at = datetime.utcnow()
        db.add(campaign)

    await db.commit()

    return {"sent": sent, "skipped": skipped, "errors": errors, "results": detail, "campaign_id": campaign.id if campaign else None}
