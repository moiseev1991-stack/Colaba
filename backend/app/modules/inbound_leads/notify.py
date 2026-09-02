"""Уведомления владельцу о новой заявке — best-effort в TG-личку и на почту.

КРИТИЧНО: ни одна ветка НЕ должна бросать исключение наружу — заявка уже
сохранена в БД, и сбой доставки уведомления не должен её «терять» и не должен
ронять запрос/бота. Все ошибки логируются, но проглатываются.
"""

from __future__ import annotations

import logging
from typing import Optional

from app.core.config import settings
from app.models.inbound_lead import InboundLead

logger = logging.getLogger(__name__)

_SOURCE_RU = {"tg_bot": "Telegram-бот", "landing_form": "форма сайта"}


def _admin_link(lead_id: int) -> str:
    base = (settings.ADMIN_PUBLIC_URL or "").rstrip("/")
    if not base:
        return ""
    return f"{base}/admin/inbound-lead/details/{lead_id}"


def _summary_lines(lead: InboundLead, company_name: str, pains: list[str]) -> list[str]:
    src = _SOURCE_RU.get(lead.source, lead.source)
    lines = [
        f"источник: {src}" + (f" · метка: {lead.source_tag}" if lead.source_tag else ""),
        f"компания: {lead.company_text.strip() or '—'}",
        f"контакт: {lead.contact_text.strip() or (('@' + lead.tg_username) if lead.tg_username else '—')}",
    ]
    if lead.name.strip():
        lines.append(f"имя: {lead.name.strip()}")
    if company_name:
        lines.append(f"сматчена в базе: {company_name}")
    if pains:
        lines.append("боли: " + "; ".join(pains))
    return lines


async def notify_owner_telegram(
    lead: InboundLead, company_name: str = "", pains: Optional[list[str]] = None
) -> None:
    """Шлёт сводку в личку Дмитрию (settings.OWNER_TG_CHAT_ID)."""
    chat_id = (settings.OWNER_TG_CHAT_ID or "").strip()
    if not chat_id:
        logger.warning(
            "inbound_leads: OWNER_TG_CHAT_ID не задан — TG-уведомление о заявке #%s пропущено",
            lead.id,
        )
        return
    try:
        from app.modules.outreach.telegram_bot import send_text_message

        body = "\n".join(_summary_lines(lead, company_name, pains or []))
        link = _admin_link(lead.id)
        text = f"🔥 <b>Новая заявка · #{lead.id}</b>\n{body}"
        if link:
            text += f'\n\n<a href="{link}">открыть в админке</a>'
        await send_text_message(chat_id, text)
    except Exception as e:  # noqa: BLE001 — best-effort, не роняем заявку
        logger.error("inbound_leads: TG-уведомление о заявке #%s не отправлено: %s", lead.id, e)


async def forward_extra_to_owner(lead: InboundLead, text: str) -> None:
    """Пересылает владельцу последующее сообщение лида как «дополнение к заявке»."""
    chat_id = (settings.OWNER_TG_CHAT_ID or "").strip()
    if not chat_id:
        return
    try:
        from app.modules.outreach.telegram_bot import send_text_message

        who = ("@" + lead.tg_username) if lead.tg_username else (lead.company_text.strip()[:40] or "лид")
        await send_text_message(
            chat_id,
            f"➕ <b>Дополнение к заявке #{lead.id}</b> ({who}):\n{text}",
        )
    except Exception as e:  # noqa: BLE001
        logger.error("inbound_leads: пересылка дополнения к заявке #%s не удалась: %s", lead.id, e)


async def notify_owner_email(
    lead: InboundLead, company_name: str = "", pains: Optional[list[str]] = None, db=None
) -> None:
    """Шлёт ту же сводку письмом на dmitry@spinlid-team.ru (SMTP Timeweb)."""
    to_email = (settings.PUBLIC_CONTACT_EMAIL or settings.SMTP_USER or "").strip()
    if not to_email:
        logger.warning(
            "inbound_leads: PUBLIC_CONTACT_EMAIL и SMTP_USER не заданы — "
            "email-уведомление о заявке #%s пропущено",
            lead.id,
        )
        return
    try:
        from app.modules.email.service import email_service

        body_lines = _summary_lines(lead, company_name, pains or [])
        link = _admin_link(lead.id)
        if link:
            body_lines.append(f"\nОткрыть в админке: {link}")
        await email_service.send_email(
            to_email=to_email,
            subject=f"Новая заявка #{lead.id} · {lead.company_text.strip()[:60] or 'без названия'}",
            body="Новая заявка на бесплатный разбор:\n\n" + "\n".join(body_lines),
            db=db,
        )
    except Exception as e:  # noqa: BLE001 — best-effort, не роняем заявку
        logger.error("inbound_leads: email-уведомление о заявке #%s не отправлено: %s", lead.id, e)
