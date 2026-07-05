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

router = APIRouter(tags=["telegram"])

WELCOME_TEXT = (
    "👋 Здравствуйте! Это бот Colaba — сервис поиска клиентов и подготовки "
    "коммерческих предложений.\n\n"
    "Здесь вы будете получать КП и ответы на вопросы.\n\n"
    "👇 Нажмите кнопку ниже «Поделиться контактом», чтобы мы могли "
    "закрепить ваш номер за вашей компанией."
)

CONTACT_KEYBOARD = {
    "keyboard": [
        [
            {
                "text": "📱 Поделиться контактом",
                "request_contact": True,
            }
        ]
    ],
    "resize_keyboard": True,
    "one_time_keyboard": True,
}


@router.post("/webhook")
async def telegram_webhook(request: Request) -> dict:
    """Приём Update от Telegram Bot API.

    Эндпоинт публичный (Telegram шлёт без auth). Секрет можно добавить
    через URL-path (например /webhook/{secret}) — для MVP без него,
    но в проде рекомендуется.
    """
    try:
        update = await request.json()
    except Exception as e:
        logger.warning("telegram webhook: invalid JSON: %s", e)
        return {"ok": False}

    message = update.get("message") or {}
    if not message:
        # Не message-update (callback_query, edited_message, ...) — игнорируем.
        return {"ok": True, "skipped": "no_message"}

    from_user = message.get("from") or {}
    chat_id = message.get("chat", {}).get("id")
    if chat_id is None:
        return {"ok": True, "skipped": "no_chat_id"}

    text = (message.get("text") or "").strip()
    contact = message.get("contact")

    # Обработка /start — создаём/обновляем подписчика, шлём welcome.
    if text == "/start":
        await _upsert_subscriber(
            chat_id=chat_id,
            username=from_user.get("username"),
            first_name=from_user.get("first_name"),
        )
        try:
            await telegram_bot.send_text_message(
                chat_id, WELCOME_TEXT, parse_mode="HTML"
            )
            # Шлём keyboard с кнопкой «Поделиться контактом» отдельным сообщением
            # через send_text_message не получится (нужен reply_markup в payload).
            # Делаем прямой POST — расширение send_text_message не делаем, чтобы
            # не усложнять KP-флоу.
            await _send_contact_request_keyboard(chat_id)
        except telegram_bot.TelegramSendError as e:
            logger.warning("telegram /start welcome failed: %s", e)
        return {"ok": True, "handled": "start"}

    # Обработка contact (юзер нажал «Поделиться контактом»).
    if contact:
        phone_raw = contact.get("phone_number") or ""
        phone = _normalize_phone(phone_raw)
        await _upsert_subscriber(
            chat_id=chat_id,
            username=from_user.get("username"),
            first_name=from_user.get("first_name") or contact.get("first_name"),
            phone=phone,
        )
        try:
            await telegram_bot.send_text_message(
                chat_id,
                "✅ Спасибо! Ваш номер закреплён. Теперь мы сможем отправить "
                "вам КП в этот чат.",
                parse_mode="HTML",
            )
        except telegram_bot.TelegramSendError as e:
            logger.warning("telegram contact-confirm send failed: %s", e)
        return {"ok": True, "handled": "contact"}

    return {"ok": True, "skipped": "unhandled_text"}


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


async def _send_contact_request_keyboard(chat_id: int) -> None:
    """Шлёт reply-клавиатуру с кнопкой request_contact.

    Прямой POST — send_text_message не умеет reply_markup.
    """
    import httpx

    from app.modules.outreach.telegram_bot import _get_bot_token_sync

    token = _get_bot_token_sync()
    if not token:
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": " ",
        "reply_markup": CONTACT_KEYBOARD,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(url, json=payload)
    except httpx.HTTPError as e:
        logger.warning("telegram _send_contact_request_keyboard: %s", e)
