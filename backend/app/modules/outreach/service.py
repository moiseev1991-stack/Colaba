"""Outreach sending service — email (SMTP) and Telegram."""

import logging
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import httpx

from app.core.config import settings
from app.modules.outreach.schemas import OutreachResult

logger = logging.getLogger(__name__)


def _smtp_configured() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD)


def _telegram_configured() -> bool:
    return bool(settings.TELEGRAM_BOT_TOKEN)


async def send_email(
    to_email: str,
    subject: str,
    body: str,
    from_name: Optional[str] = None,
) -> None:
    """Send a plain-text email via SMTP.  Raises on failure."""
    if not _smtp_configured():
        raise RuntimeError(
            "SMTP не настроен. Укажите SMTP_HOST, SMTP_USER, SMTP_PASSWORD в переменных окружения."
        )

    sender = f"{from_name} <{settings.SMTP_USER}>" if from_name else settings.SMTP_USER

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to_email
    msg.attach(MIMEText(body, "plain", "utf-8"))

    ctx = ssl.create_default_context()

    if settings.SMTP_USE_SSL:
        with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, context=ctx, timeout=15) as smtp:
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.sendmail(settings.SMTP_USER, to_email, msg.as_bytes())
    else:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
            smtp.starttls(context=ctx)
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.sendmail(settings.SMTP_USER, to_email, msg.as_bytes())


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
) -> dict:
    """Send outreach to a list of SearchResult IDs.  Reads outreach text from DB."""
    from sqlalchemy import select
    from app.models.search import SearchResult

    result = await db.execute(
        select(SearchResult).where(SearchResult.id.in_(search_result_ids))
    )
    results = result.scalars().all()

    sent = 0
    skipped = 0
    errors = 0
    detail: list[OutreachResult] = []

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
            try:
                await send_email(
                    to_email=sr.email,
                    subject=sr.outreach_subject or "Коммерческое предложение",
                    body=sr.outreach_text,
                    from_name=from_name,
                )
                detail.append(OutreachResult(search_result_id=rid, status="sent"))
                sent += 1
            except Exception as exc:
                logger.warning(f"Failed to send email to {sr.email}: {exc}")
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

    return {"sent": sent, "skipped": skipped, "errors": errors, "results": detail}
