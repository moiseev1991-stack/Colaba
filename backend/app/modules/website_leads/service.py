"""Логика приёма и админ-просмотра заявок с публичных landing-страниц.

Главное:
  - `submit_lead` принимает анонимный POST, фильтрует honeypot и
    делает мягкую валидацию контакта (email/phone/username) — без
    жёстких регулярок, чтобы не отсечь живых юзеров с нестандартным
    форматом.
  - `list_leads` / `update_status` / `soft_delete` — только для админа.
"""

import logging
import re
from datetime import datetime
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.website_lead import WebsiteLead
from app.modules.website_leads import antispam
from app.modules.website_leads.schemas import (
    WebsiteLeadSubmit,
    WebsiteLeadSubmitResponse,
)

logger = logging.getLogger(__name__)


# Очень мягкие минимальные правила: email должен иметь '@' и точку,
# телефон — хотя бы 7 цифр. Юзер в WhatsApp/Telegram/MAX может прислать
# username или ссылку — там не валидируем формат, только длину.
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PHONE_DIGITS_RE = re.compile(r"\d")


def _is_plausible_contact(channel: str, contact: str) -> bool:
    contact = (contact or "").strip()
    if len(contact) < 2:
        return False
    if channel == "email":
        return bool(_EMAIL_RE.match(contact)) and len(contact) <= 255
    if channel == "phone":
        digits = "".join(_PHONE_DIGITS_RE.findall(contact))
        return 7 <= len(digits) <= 20
    # whatsapp / telegram / max — допускаем номер, username, ссылку.
    # Минимум 3 символа.
    return len(contact) >= 3


async def submit_lead(
    db: AsyncSession,
    payload: WebsiteLeadSubmit,
    *,
    client_ip: str,
    user_agent: str,
    origin: str = "",
    referer: str = "",
) -> WebsiteLeadSubmitResponse:
    """Принять заявку с публичной формы.

    Возвращает одно и то же сообщение для honeypot-ботов и реальных
    юзеров — чтобы боту не было сигнала «нас раскусили».
    """

    # 1. Honeypot — тихо отбрасываем, но юзеру (и боту) пишем «ок».
    if (payload.hp or "").strip():
        logger.info(
            "website_lead.reject reason=honeypot ip=%s ua=%r",
            client_ip,
            user_agent[:80],
        )
        return WebsiteLeadSubmitResponse()

    # 2a. Origin/Referer-фильтр — submit должен прийти с нашего домена.
    if not antispam.is_legit_origin(origin, referer):
        logger.info(
            "website_lead.reject reason=bad_origin ip=%s origin=%r referer=%r",
            client_ip,
            origin[:80],
            referer[:80],
        )
        return WebsiteLeadSubmitResponse()

    # 2b. UA bot-фильтр (см. antispam._BOT_UA_RE).
    if antispam.is_bot_ua(user_agent):
        logger.info(
            "website_lead.reject reason=bot_ua ip=%s ua=%r",
            client_ip,
            user_agent[:120],
        )
        return WebsiteLeadSubmitResponse()

    # 3. Server-issued one-shot token + time-trap (≥3 сек на заполнение,
    # токен живёт ≤30 мин, повторно не используется).
    token_ok, token_reason = await antispam.verify_form_token(
        payload.form_token or "", int(payload.fill_time_ms or 0)
    )
    if not token_ok:
        logger.info(
            "website_lead.reject reason=token:%s ip=%s ua=%r",
            token_reason,
            client_ip,
            user_agent[:80],
        )
        return WebsiteLeadSubmitResponse()

    if not _is_plausible_contact(payload.channel, payload.contact):
        # Невалидный контакт — но ответ всё равно успешный, чтобы боты
        # не enumerate'или формат. На фронте валидируем то же самое
        # клиентским кодом и НЕ должны такого пропускать.
        logger.info(
            "website_lead.reject reason=invalid_contact channel=%s contact=%r ip=%s",
            payload.channel,
            payload.contact[:40],
            client_ip,
        )
        return WebsiteLeadSubmitResponse()

    # 4. Дедуп: один и тот же `(ip, contact)` не чаще раза в 24 часа.
    if not await antispam.check_dedup(client_ip, payload.contact):
        logger.info(
            "website_lead.reject reason=dedup ip=%s contact=%r",
            client_ip,
            payload.contact[:40],
        )
        return WebsiteLeadSubmitResponse()

    lead = WebsiteLead(
        name=payload.name[:120],
        channel=payload.channel,
        contact=payload.contact[:255],
        wish=payload.wish[:2000],
        source_page=payload.source_page[:500],
        referrer=payload.referrer[:500],
        ip=(client_ip or "")[:64],
        user_agent=(user_agent or "")[:500],
        status="new",
        created_at=datetime.utcnow(),
    )
    db.add(lead)
    await db.commit()
    await db.refresh(lead)
    logger.info(
        "website_lead.created id=%s channel=%s source=%s",
        lead.id,
        lead.channel,
        lead.source_page,
    )
    return WebsiteLeadSubmitResponse()


async def list_leads(
    db: AsyncSession,
    *,
    status_filter: Optional[str] = None,
    include_deleted: bool = False,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[WebsiteLead], int]:
    stmt = select(WebsiteLead).order_by(WebsiteLead.created_at.desc())
    count_stmt = select(func.count(WebsiteLead.id))

    if not include_deleted:
        stmt = stmt.where(WebsiteLead.deleted_at.is_(None))
        count_stmt = count_stmt.where(WebsiteLead.deleted_at.is_(None))

    if status_filter:
        stmt = stmt.where(WebsiteLead.status == status_filter)
        count_stmt = count_stmt.where(WebsiteLead.status == status_filter)

    stmt = stmt.limit(min(limit, 500)).offset(max(offset, 0))

    total = (await db.execute(count_stmt)).scalar_one()
    items = (await db.execute(stmt)).scalars().all()
    return list(items), int(total)


async def update_status(
    db: AsyncSession, lead_id: int, new_status: str
) -> Optional[WebsiteLead]:
    lead = (
        await db.execute(select(WebsiteLead).where(WebsiteLead.id == lead_id))
    ).scalar_one_or_none()
    if not lead:
        return None
    lead.status = new_status
    await db.commit()
    await db.refresh(lead)
    return lead


async def soft_delete(db: AsyncSession, lead_id: int) -> bool:
    lead = (
        await db.execute(select(WebsiteLead).where(WebsiteLead.id == lead_id))
    ).scalar_one_or_none()
    if not lead:
        return False
    lead.deleted_at = datetime.utcnow()
    await db.commit()
    return True
