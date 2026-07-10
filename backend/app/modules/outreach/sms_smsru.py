"""SMS.ru клиент для канала SMS в KP-send (2026-07-10).

SMS.ru (https://sms.ru) — самый простой российский SMS-провайдер:
регистрация 1 минута, api_id (UUID) в кабинете → Настройки → API,
тариф от 2.13 ₽/сегмент кириллицей (70 знаков). API — GET-запрос
с query-параметрами.

Здесь — только `send_text_message`: один GET в /sms/send. Прием входящих,
статусы delivery через callback и балансовые запросы в KP-флоу пока не нужны.

Конфиг в backend/app/core/config.py: SMSRU_API_URL / SMSRU_API_KEY / SMSRU_FROM.
Если SMSRU_API_KEY пустое — `is_configured()` → False и enqueue в
kp_send_service пишет skipped(smsru_not_configured).

Стоимость (важно!)
------------------
SMS кириллицей = 1 сегмент = 70 символов. КП обычно 400-1200 символов =
6-17 сегментов = 15-40 ₽ за одну отправку. Дорого для полного КП —
используем SMS как **короткое уведомление**: «Отправили вам КП на email,
проверьте / ответьте DA если интересно». _compose_sms_text урезает до
300 символов (~4-5 сегментов, ~10-12 ₽).
"""

from __future__ import annotations

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


# SMS.ru рекомендует не более 30 msg/s без специального тарифа. Bulk-send
# в kp tasks._send_kp_batch_async уже спит _PER_SEND_SLEEP_SEC=0.4 между
# отправками (~2.5 msg/s) — с запасом.
DEFAULT_TIMEOUT_SEC = 15


class SmsSendError(Exception):
    """Ошибка отправки SMS с человекочитаемым сообщением.

    Соответствует error_code в KpSend.error_code:
      - 'not_configured'    — SMSRU_API_KEY не задан в env
      - 'invalid_phone'     — телефон не в РФ-формате
      - 'http_error'        — HTTP-ошибка (4xx/5xx) от SMS.ru
      - 'api_error'         — SMS.ru вернул JSON с status_code != 100
      - 'no_message_id'     — 200 OK, но без sms_id
      - 'network_error'     — таймаут / DNS / прочее
    """

    def __init__(self, message: str, *, code: str = "send_failed") -> None:
        super().__init__(message)
        self.message = message
        self.code = code


def is_configured() -> bool:
    """True если SMSRU_API_KEY прописан в env. False → канал sms в kp_send
    пишет skipped с понятным error_code."""
    return settings.smsru_enabled


def _phone_to_smsru(phone_digits: str) -> str:
    """Мобильный РФ digits-only → формат для SMS.ru.

    SMS.ru принимает международный формат без '+' и без '00'. Российский
    мобильный '79991234567' — уже готов. '89991234567' надо превратить в
    '79991234567' (замена ведущей 8 на 7).
    """
    p = phone_digits.strip()
    if p.startswith("8") and len(p) == 11:
        p = "7" + p[1:]
    return p


async def send_text_message(
    phone_digits: str, text: str, *, timeout: float = DEFAULT_TIMEOUT_SEC
) -> str:
    """Шлёт одно текстовое SMS через SMS.ru.

    Возвращает sms_id (пишется в KpSend.provider_message_id — SMS.ru
    его использует для callback-статусов delivery, если настроим).

    Подымает SmsSendError с понятным кодом — kp_send_service логирует
    его в строку KpSend.
    """
    if not is_configured():
        raise SmsSendError(
            "SMS.ru не настроен — добавь SMSRU_API_KEY в env коннектора.",
            code="not_configured",
        )

    if not phone_digits or not phone_digits.isdigit():
        raise SmsSendError(
            "Телефон должен быть в digits-only формате (например 79991234567).",
            code="invalid_phone",
        )

    if not text or not text.strip():
        raise SmsSendError(
            "Текст сообщения пуст — нечего отправлять.",
            code="empty_message",
        )

    url = f"{settings.SMSRU_API_URL.rstrip('/')}/sms/send"
    params: dict[str, str] = {
        "api_id": settings.SMSRU_API_KEY,
        "to": _phone_to_smsru(phone_digits),
        "msg": text,
        "json": "1",
    }
    if settings.SMSRU_FROM:
        params["from"] = settings.SMSRU_FROM

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.get(url, params=params)
    except httpx.TimeoutException:
        raise SmsSendError("Таймаут запроса к SMS.ru.", code="network_error")
    except httpx.HTTPError as e:
        raise SmsSendError(
            f"Сетевая ошибка при обращении к SMS.ru: {e}",
            code="network_error",
        )

    if r.status_code >= 400:
        raise SmsSendError(
            f"SMS.ru вернул HTTP {r.status_code}: {r.text[:200]}",
            code="http_error",
        )

    try:
        data = r.json()
    except Exception:
        raise SmsSendError(
            f"SMS.ru вернул не-JSON: {r.text[:200]}",
            code="api_error",
        )

    # Формат ответа SMS.ru при json=1:
    # {"status":"OK","status_code":100,"sms":{"79...":{"status":"OK","status_code":100,"sms_id":"..."}},"balance":123}
    status_code = data.get("status_code")
    if status_code != 100:
        # Основные коды:
        # 200 — неверный api_id, 201 — не хватает средств, 202 — неверный
        # телефон, 203 — сообщение слишком длинное, 204 — from не одобрен.
        msg = data.get("status_text") or f"code={status_code}"
        raise SmsSendError(f"SMS.ru отклонил запрос: {msg}", code="api_error")

    sms_block = data.get("sms") or {}
    if not isinstance(sms_block, dict) or not sms_block:
        raise SmsSendError(
            "SMS.ru не вернул блок 'sms' — не понимаю ответ.",
            code="api_error",
        )
    # Внутри — один ключ (номер), в нём наш sms_id.
    per_phone = next(iter(sms_block.values()), {})
    if not isinstance(per_phone, dict):
        raise SmsSendError("SMS.ru: некорректный формат sms[phone].", code="api_error")

    if per_phone.get("status_code") != 100:
        msg = per_phone.get("status_text") or f"code={per_phone.get('status_code')}"
        raise SmsSendError(
            f"SMS.ru отказал в отправке на этот номер: {msg}",
            code="api_error",
        )

    sms_id = per_phone.get("sms_id")
    if not sms_id:
        raise SmsSendError(
            "SMS.ru принял отправку, но не вернул sms_id — нечего трекать.",
            code="no_message_id",
        )
    return str(sms_id)
