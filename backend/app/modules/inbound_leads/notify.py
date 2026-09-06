"""Уведомления владельцу о новой заявке — best-effort в TG-личку и на почту.

КРИТИЧНО: ни одна ветка НЕ должна бросать исключение наружу — заявка уже
сохранена в БД, и сбой доставки уведомления не должен её «терять» и не должен
ронять запрос/бота. Все ошибки логируются, но проглатываются.
"""

from __future__ import annotations

import html
import logging
from typing import Optional

from app.core.config import settings
from app.models.inbound_lead import InboundLead

logger = logging.getLogger(__name__)

_SOURCE_RU = {"tg_bot": "Telegram-бот", "landing_form": "форма сайта"}
# Метка source_tag (группа/страница) → человекочитаемое имя для сводки.
_GROUP_RU = {
    "zvonki": "A · дозвон/запись",
    "ocheredi": "B · очереди/ожидание",
    "zakazy": "D1 · статус заказа",
    "general": "общий лендинг (C/D2)",
    "landing": "общий лендинг",
    "email": "email",
    "tg": "Telegram",
}


def _admin_link(lead_id: int) -> str:
    base = (settings.ADMIN_PUBLIC_URL or "").rstrip("/")
    if not base:
        return ""
    return f"{base}/admin/inbound-lead/details/{lead_id}"


def _group_label(source_tag: str) -> str:
    tag = (source_tag or "").strip()
    if not tag:
        return ""
    # deep-link мог прийти как 'zvonki_3080' — берём часть до '_'.
    base = tag.split("_", 1)[0]
    return _GROUP_RU.get(base, tag)


def _summary_lines(lead: InboundLead, brief: Optional[dict] = None) -> list[str]:
    """Строки сводки заявки для владельца (общие для TG и email).

    brief: {name, niche, city, pains: list[str], quote} — данные сматченной
    компании (готовый разбор). Пустой/None → только поля самой заявки.
    """
    brief = brief or {}
    src = _SOURCE_RU.get(lead.source, lead.source)
    group = _group_label(lead.source_tag)
    lines = [
        f"источник: {src}" + (f" · группа: {group}" if group else ""),
        f"компания: {lead.company_text.strip() or brief.get('name') or '—'}",
        f"контакт: {lead.contact_text.strip() or (('@' + lead.tg_username) if lead.tg_username else '—')}",
    ]
    if lead.name.strip():
        lines.append(f"имя: {lead.name.strip()}")
    name = (brief.get("name") or "").strip()
    if name:
        loc = " · ".join(p for p in (brief.get("niche"), brief.get("city")) if p)
        lines.append(f"сматчена в базе: {name}" + (f" ({loc})" if loc else ""))
    pains = brief.get("pains") or []
    if pains:
        lines.append("боли: " + "; ".join(pains))
    quote = (brief.get("quote") or "").strip()
    if quote:
        lines.append(f"цитата: «{quote[:280]}»")
    return lines


async def notify_owner_telegram(lead: InboundLead, brief: Optional[dict] = None) -> None:
    """Шлёт сводку-разбор в личку Дмитрию (settings.OWNER_TG_CHAT_ID)."""
    chat_id = (settings.OWNER_TG_CHAT_ID or "").strip()
    if not chat_id:
        logger.warning(
            "inbound_leads: OWNER_TG_CHAT_ID не задан — TG-уведомление о заявке #%s пропущено",
            lead.id,
        )
        return
    try:
        from app.modules.outreach.telegram_bot import send_text_message

        body = "\n".join(html.escape(line) for line in _summary_lines(lead, brief))
        link = _admin_link(lead.id)
        text = f"🔥 <b>Новая заявка · #{lead.id}</b>\n{body}"
        if link:
            text += f'\n\n<a href="{html.escape(link, quote=True)}">открыть в админке</a>'
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
            f"➕ <b>Дополнение к заявке #{lead.id}</b> ({html.escape(who)}):\n{html.escape(text)}",
        )
    except Exception as e:  # noqa: BLE001
        logger.error("inbound_leads: пересылка дополнения к заявке #%s не удалась: %s", lead.id, e)


async def notify_owner_email(
    lead: InboundLead, brief: Optional[dict] = None, db=None
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

        body_lines = _summary_lines(lead, brief)
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
