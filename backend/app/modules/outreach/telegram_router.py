"""Telegram webhook router — приём Updates от Bot API.

Когда пользователь нажимает /start на нашем боте, Telegram присылает POST
на /telegram/webhook с Update. Здесь мы:
1. Извлекаем chat_id, username, first_name из message.from.
2. Создаём/обновляем TelegramSubscriber.
3. Шлём welcome-message с кнопкой «Поделиться контактом» (request_contact).

Если юзер шарит контакт (message.contact.phone_number), обновляем
TelegramSubscriber.phone — это ключ связи с компанией для КП-конвейера.

Также админский POST /telegram/setup-webhook — устанавливает webhook
на публичный URL (нужен для приёма Updates).
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import require_superuser
from app.models.telegram_subscriber import TelegramSubscriber
from app.models.user import User
from app.modules.outreach import telegram_bot

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/telegram", tags=["telegram"])

# Тексты диалога бота-приёмника (персона «Дмитрий»). НЕ упоминаем SpinLid/Colaba.
GREETING_TEXT = (
    "Здравствуйте! Я Дмитрий. Помогаю бизнесу не терять клиентов на недозвонах "
    "и потерянных заявках.\n\n"
    "Напишите название вашей компании (или ссылку на неё в 2ГИС/Яндекс.Картах) — "
    "я посмотрю отзывы и покажу, где теряются клиенты. Это бесплатно."
)
ASK_CONTACT_TEXT = "Принял. Как с вами связаться — телефон или удобно здесь, в Telegram?"
THANKS_TEXT = (
    "Спасибо! Разбор пришлю в течение пары часов в рабочее время. "
    "Если срочно — просто напишите сюда."
)
EXTRA_ACK_TEXT = "Принял 👍 Отвечу здесь в ближайшее время."

# Одна кнопка «Оставить контакт» (TZ §2.2 — не плодить меню).
CONTACT_KEYBOARD = {
    "keyboard": [[{"text": "📱 Оставить контакт", "request_contact": True}]],
    "resize_keyboard": True,
    "one_time_keyboard": True,
}

_PHASE_TEXT = {
    "greeting": GREETING_TEXT,
    "ask_contact": ASK_CONTACT_TEXT,
    "thanks": THANKS_TEXT,
    "extra": EXTRA_ACK_TEXT,
}


def _parse_start_payload(text: str) -> str:
    """'/start email' → 'email'. Метка источника из deep-link t.me/<bot>?start=<tag>."""
    parts = text.split(maxsplit=1)
    return parts[1].strip()[:120] if len(parts) > 1 else ""


@router.post("/webhook")
async def telegram_webhook(request: Request) -> dict:
    """Приём Update от Telegram Bot API — бот-приёмник заявок «Дмитрий».

    Эндпоинт публичный (Telegram шлёт без auth). Каждое входящее сообщение
    маршрутизируется в inbound_leads.service.handle_bot_message (создание/
    дополнение заявки + уведомление владельцу). По возвращённой фазе шлём
    ответ из сценария §2.2.
    """
    from app.core.database import AsyncSessionLocal
    from app.modules.inbound_leads import service as inbound_service

    try:
        update = await request.json()
    except Exception as e:
        logger.warning("telegram webhook: invalid JSON: %s", e)
        return {"ok": False}

    message = update.get("message") or {}
    if not message:
        return {"ok": True, "skipped": "no_message"}

    from_user = message.get("from") or {}
    chat_id = message.get("chat", {}).get("id")
    tg_user_id = from_user.get("id")
    if chat_id is None or tg_user_id is None:
        return {"ok": True, "skipped": "no_ids"}

    username = from_user.get("username")
    text = (message.get("text") or "").strip()
    contact = message.get("contact")

    is_start = text.startswith("/start")
    source_tag = _parse_start_payload(text) if is_start else ""

    # Контакт по кнопке «Оставить контакт» → трактуем телефон как контентное
    # сообщение с контактом (state-машина сама разложит).
    if contact and not text:
        text = _normalize_phone(contact.get("phone_number") or "") or (contact.get("phone_number") or "")

    # Держим подписчика в telegram_subscribers (совместимость с КП-конвейером).
    try:
        await _upsert_subscriber(
            chat_id=chat_id,
            username=username,
            first_name=from_user.get("first_name"),
            phone=(_normalize_phone(contact.get("phone_number") or "") if contact else None),
        )
    except Exception as e:  # noqa: BLE001 — не роняем приём заявки из-за подписчика
        logger.warning("telegram webhook: upsert_subscriber failed: %s", e)

    # Основной маршрут — заявка. Своя сессия: webhook вне request-db-scope.
    phase = "greeting"
    try:
        async with AsyncSessionLocal() as db:
            _lead, phase = await inbound_service.handle_bot_message(
                db,
                tg_user_id=int(tg_user_id),
                tg_username=username,
                text=text,
                source_tag=source_tag,
                is_start=is_start,
            )
    except Exception as e:  # noqa: BLE001
        # TZ §2.5: даже при сбое бэка бот отвечает лиду, заявку не теряем.
        logger.exception("telegram webhook: handle_bot_message failed: %s", e)
        try:
            await telegram_bot.send_text_message(
                chat_id,
                "Спасибо! Записал, свяжусь с вами в ближайшее время.",
            )
        except telegram_bot.TelegramSendError:
            pass
        return {"ok": True, "handled": "fallback"}

    reply = _PHASE_TEXT.get(phase, THANKS_TEXT)
    try:
        if phase == "ask_contact":
            # На шаге запроса контакта показываем единственную кнопку.
            await _send_reply_with_keyboard(chat_id, reply, CONTACT_KEYBOARD)
        else:
            await telegram_bot.send_text_message(chat_id, reply)
    except telegram_bot.TelegramSendError as e:
        logger.warning("telegram webhook: reply send failed: %s", e)

    return {"ok": True, "handled": phase}


@router.post("/setup-webhook")
async def setup_telegram_webhook(
    body: dict | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superuser),
) -> dict:
    """Устанавливает webhook на бота. Только superuser.

    Body: {"public_url": "https://your-domain.com"} — публичный HTTPS URL.
    Telegram будет POSTить Updates на {public_url}/api/v1/telegram/webhook.
    """
    public_url = (body or {}).get("public_url") if body else None
    if not public_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="public_url обязателен (HTTPS, публичный)",
        )
    if not public_url.startswith("https://"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="public_url должен быть https:// (требование Telegram)",
        )
    try:
        result = await telegram_bot.setup_webhook(public_url)
    except telegram_bot.TelegramSendError as e:
        raise HTTPException(status_code=502, detail=f"{e.code}: {e.message}")
    return {"setup_result": result, "webhook_url": f"{public_url.rstrip('/')}/api/v1/telegram/webhook"}


@router.post("/delete-webhook")
async def delete_telegram_webhook(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superuser),
) -> dict:
    """Удаляет webhook (переход на getUpdates long-polling). Только superuser."""
    try:
        result = await telegram_bot.delete_webhook()
    except telegram_bot.TelegramSendError as e:
        raise HTTPException(status_code=502, detail=f"{e.code}: {e.message}")
    return {"delete_result": result}


# ────────────────────────────────────────────────────────────────────
# Хелперы
# ────────────────────────────────────────────────────────────────────


async def _upsert_subscriber(
    *,
    chat_id: int,
    username: Optional[str] = None,
    first_name: Optional[str] = None,
    phone: Optional[str] = None,
) -> TelegramSubscriber:
    """Создаёт или обновляет TelegramSubscriber по chat_id."""
    from sqlalchemy.exc import IntegrityError

    from app.core.database import AsyncSessionLocal

    # Своя сессия — webhook может прийти в любом контексте, не хотим
    # тащить request-db-state.
    try:
        async with AsyncSessionLocal() as db:
            existing = (
                await db.execute(
                    select(TelegramSubscriber).where(
                        TelegramSubscriber.chat_id == chat_id
                    )
                )
            ).scalar_one_or_none()

            if existing:
                # Обновляем только если есть что обновлять (не затираем phone).
                if username and existing.username != username:
                    existing.username = username
                if first_name and existing.first_name != first_name:
                    existing.first_name = first_name
                if phone:
                    existing.phone = phone
                existing.last_interaction_at = datetime.utcnow()
                db.add(existing)
                await db.commit()
                await db.refresh(existing)
                return existing

            sub = TelegramSubscriber(
                chat_id=chat_id,
                username=username,
                first_name=first_name,
                phone=phone,
                last_interaction_at=datetime.utcnow(),
            )
            db.add(sub)
            try:
                await db.commit()
            except IntegrityError:
                # Concurrent /start — кто-то уже создал. Перечитываем.
                await db.rollback()
                sub = (
                    await db.execute(
                        select(TelegramSubscriber).where(
                            TelegramSubscriber.chat_id == chat_id
                        )
                    )
                ).scalar_one()
            await db.refresh(sub)
            return sub
    except Exception as e:
        logger.exception("telegram _upsert_subscriber failed: %s", e)
        raise


def _normalize_phone(raw: str) -> Optional[str]:
    """Приводит телефон к формату 79XXXXXXXXX (РФ-мобильный).

    Возвращает None если не похоже на РФ-мобильный.
    """
    if not raw:
        return None
    digits = "".join(c for c in raw if c.isdigit())
    # +7 999 1234567 → 79991234567
    if digits.startswith("8") and len(digits) == 11:
        digits = "7" + digits[1:]
    if digits.startswith("7") and len(digits) == 11:
        return digits
    if len(digits) == 10 and digits.startswith("9"):
        return "7" + digits
    return digits or None


async def _send_reply_with_keyboard(chat_id: int, text: str, keyboard: dict) -> None:
    """Шлёт текст с reply-клавиатурой одним сообщением.

    Прямой POST — send_text_message не умеет reply_markup.
    """
    import httpx

    from app.modules.outreach.telegram_bot import _get_bot_token_sync

    token = _get_bot_token_sync()
    if not token:
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "reply_markup": keyboard}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(url, json=payload)
    except httpx.HTTPError as e:
        logger.warning("telegram _send_reply_with_keyboard: %s", e)
