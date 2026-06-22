"""GreenAPI клиент для канала WhatsApp в KP-send (2026-06-23).

GreenAPI (https://green-api.com) — российский SaaS-провайдер WhatsApp
Business API: ты регистрируешь «инстанс» (виртуальный номер, привязанный
к WhatsApp), получаешь idInstance + apiTokenInstance, и шлёшь сообщения
HTTP-POST'ом. Тариф «Developer» ~1500₽/мес, demo на 14 дней до ~200 msg.

Здесь — только `send_text_message`: один POST в /sendMessage. Группы,
файлы, голосовые, опросы и приём входящих в нашем KP-флоу не нужны.

Конфиг в backend/app/core/config.py: GREENAPI_API_URL / GREENAPI_INSTANCE_ID
/ GREENAPI_API_TOKEN. Если хоть одно пустое — `is_configured()` → False
и enqueue в kp_send_service пишет skipped(greenapi_not_configured).
"""

from __future__ import annotations

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


# GreenAPI заявленный rate limit на платных тарифах — 3 msg/sec на инстанс.
# Bulk-send в kp tasks._send_kp_batch_async уже спит _PER_SEND_SLEEP_SEC=0.4
# между отправками, что даёт ~2.5 msg/sec — укладывается в лимит.
DEFAULT_TIMEOUT_SEC = 20


class WhatsAppSendError(Exception):
    """Ошибка отправки WhatsApp с человекочитаемым сообщением.

    Соответствует error_code в KpSend.error_code:
      - 'not_configured'   — GreenAPI ключи не заданы в env
      - 'invalid_phone'    — телефон не в РФ-мобильном формате
      - 'http_error'       — HTTP-ошибка (4xx/5xx) от GreenAPI
      - 'no_message_id'    — GreenAPI ответил 200, но без idMessage
      - 'network_error'    — таймаут / DNS / прочее
    """

    def __init__(self, message: str, *, code: str = "send_failed") -> None:
        super().__init__(message)
        self.message = message
        self.code = code


def is_configured() -> bool:
    """True если GreenAPI ключи прописаны в env. False → канал whatsapp
    в kp_send пишет skipped с понятным error_code."""
    return settings.greenapi_enabled


def _phone_to_chat_id(phone_digits: str) -> str:
    """Мобильный РФ digits-only → chatId для GreenAPI.
    Формат для индивидуальных чатов: '{digits}@c.us'. Группы — '@g.us',
    но мы их не используем (КП — личный диалог)."""
    return f"{phone_digits}@c.us"


async def send_text_message(
    phone_digits: str, text: str, *, timeout: float = DEFAULT_TIMEOUT_SEC
) -> str:
    """Шлёт одно текстовое WhatsApp-сообщение через GreenAPI.

    Возвращает idMessage (записывается в KpSend.provider_message_id для
    последующего трекинга delivery/read через webhook'и GreenAPI, если
    подключим).

    Подымает WhatsAppSendError с понятным кодом — kp_send_service
    логирует его в строку KpSend.
    """
    if not is_configured():
        raise WhatsAppSendError(
            "GreenAPI не настроен — добавь GREENAPI_INSTANCE_ID и "
            "GREENAPI_API_TOKEN в env коннектора.",
            code="not_configured",
        )

    if not phone_digits or not phone_digits.isdigit():
        raise WhatsAppSendError(
            "Телефон должен быть в digits-only формате (например 79991234567).",
            code="invalid_phone",
        )

    if not text or not text.strip():
        raise WhatsAppSendError(
            "Текст сообщения пуст — нечего отправлять.",
            code="empty_message",
        )

    url = (
        f"{settings.GREENAPI_API_URL.rstrip('/')}"
        f"/waInstance{settings.GREENAPI_INSTANCE_ID}"
        f"/sendMessage/{settings.GREENAPI_API_TOKEN}"
    )
    payload = {"chatId": _phone_to_chat_id(phone_digits), "message": text}

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, json=payload)
    except httpx.TimeoutException as e:
        raise WhatsAppSendError(
            f"GreenAPI таймаут после {timeout}с — попробуй позже.",
            code="network_error",
        ) from e
    except httpx.HTTPError as e:
        raise WhatsAppSendError(
            f"Сетевая ошибка к GreenAPI: {e}",
            code="network_error",
        ) from e

    if response.status_code >= 400:
        # GreenAPI 466 = «инстанс не авторизован» (QR-код не отсканирован),
        # 401 = неверный apiTokenInstance, 400 = битый chatId/payload.
        # Текст ответа кидаем в error_message без логина-к-логам.
        snippet = response.text[:300] if response.text else "<empty>"
        raise WhatsAppSendError(
            f"GreenAPI HTTP {response.status_code}: {snippet}",
            code="http_error",
        )

    try:
        data = response.json()
    except ValueError as e:
        raise WhatsAppSendError(
            f"GreenAPI вернул не-JSON: {response.text[:200]}",
            code="http_error",
        ) from e

    message_id = (data or {}).get("idMessage")
    if not message_id:
        raise WhatsAppSendError(
            f"GreenAPI ответил 200, но без idMessage: {data}",
            code="no_message_id",
        )
    return str(message_id)
