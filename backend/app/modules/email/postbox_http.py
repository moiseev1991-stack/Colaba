"""Yandex Cloud Postbox HTTP API клиент (AWS SES-compatible).

Альтернатива SMTP-отправке для Postbox: работает через HTTPS (порт 443),
обходит блокировку исходящих SMTP-портов 25/465/587 на VPS-хостингах.

Endpoint: https://postbox.cloud.yandex.net (AWS SESv2-compatible API).
Авторизация: AWS Signature v4 с теми же API-key ID + secret что и для SMTP.

Использует boto3 — официальный AWS SDK для Python. Yandex Cloud Postbox
полностью совместим с AWS SESv2 API (подтверждено официальным примером
yandex-cloud-examples/yc-postbox-bulkemails).

Credы те же, что для SMTP:
- access_key_id = smtp_user (ID API-ключа)
- secret_access_key = smtp_password (секрет API-ключа)
- region = 'ru-central1' (default)

Возвращает message_id — уникальный идентификатор письма (пишется в
KpSend.provider_message_id).
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Yandex Cloud Postbox — единственный регион ru-central1.
DEFAULT_REGION = "ru-central1"
DEFAULT_ENDPOINT = "https://postbox.cloud.yandex.net"


class PostboxHTTPError(Exception):
    """Ошибка отправки через Postbox HTTP API.

    Коды согласованы с smtp-ошибками для KpSend.error_code:
      - 'not_configured'  — нет ключей
      - 'http_error'      — 4xx/5xx от Postbox
      - 'no_message_id'   — ответ без MessageId
      - 'internal'        — прочие
    """

    def __init__(self, message: str, *, code: str = "send_failed") -> None:
        super().__init__(message)
        self.message = message
        self.code = code


def _build_client(access_key_id: str, secret_access_key: str, region: str = DEFAULT_REGION):
    """Создаёт boto3 SESv2 client для Postbox.

    Импорт boto3 ленивый — чтобы не тянуть зависимость при `import service`
    в окружениях без boto3 (например, тесты без постбокса).
    """
    try:
        import boto3
        from botocore.client import Config
    except ImportError as e:
        raise PostboxHTTPError(
            "boto3 не установлен. Добавьте boto3 в requirements.txt.",
            code="not_configured",
        ) from e

    return boto3.client(
        service_name="sesv2",
        endpoint_url=DEFAULT_ENDPOINT,
        region_name=region,
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
        config=Config(signature_version="s3v4", retries={"max_attempts": 2}),
    )


def _encode_email_domain(addr: str) -> str:
    """Кодирует доменную часть email-адреса в punycode (IDNA).

    Обрабатывает форматы:
      - «user@домен.рф» → «user@xn--...»
      - «Имя <user@домен.рф>» → «Имя <user@xn--...>»

    ASCII-домены (.ru/.com) проходят без изменений. Нужно для Yandex Cloud
    Postbox (SESv2-совместимый API), который отклоняет raw-кириллицу.
    """
    if not addr or "@" not in addr:
        return addr

    def _encode_single(email_str: str) -> str:
        email_str = email_str.strip()
        if "@" not in email_str:
            return email_str
        local, domain = email_str.rsplit("@", 1)
        # Кодируем только если есть non-ASCII символы
        try:
            if not domain.isascii():
                domain = domain.encode("idna").decode("ascii")
        except UnicodeError:
            # если IDNA не справился — отдаём как есть (пусть SES отклонит)
            pass
        return f"{local}@{domain}"

    # Формат «Имя <email>»
    if "<" in addr and ">" in addr:
        lt = addr.index("<")
        gt = addr.index(">", lt)
        prefix = addr[:lt]
        email_part = addr[lt + 1 : gt]
        suffix = addr[gt + 1 :]
        return f"{prefix}<{_encode_single(email_part)}>{suffix}"

    return _encode_single(addr)


async def send_email(
    *,
    access_key_id: str,
    secret_access_key: str,
    from_email: str,
    to_email: str,
    subject: str,
    html_body: Optional[str] = None,
    text_body: Optional[str] = None,
    from_name: Optional[str] = None,
    region: str = DEFAULT_REGION,
    reply_to: Optional[str] = None,
) -> str:
    """Отправляет письмо через Postbox HTTP API (AWS SESv2 SendEmail).

    Возвращает MessageId (строка) → пишется в KpSend.provider_message_id.
    Подымает PostboxHTTPError с понятным кодом.

    ``reply_to`` — адрес для ответа (Reply-To). Лид, нажав «Ответить»,
    шлёт письмо на этот адрес (обычно — личный ящик пользователя spinlid,
    а не системный отправитель). None = без заголовка Reply-To.
    """
    if not access_key_id or not secret_access_key:
        raise PostboxHTTPError(
            "Не заданы API-key ID/секрет для Postbox",
            code="not_configured",
        )
    if not from_email or not to_email:
        raise PostboxHTTPError(
            "Не задан from_email или to_email",
            code="not_configured",
        )

    # boto3 — синхронный; заворачиваем в anyio thread, чтобы не блокотать event loop.
    # В requirements уже есть anyio (через starlette).
    import anyio

    # Формируем From с именем: "Иван <hello@domain.ru>".
    if from_name:
        from_addr = f"{from_name} <{from_email}>"
    else:
        from_addr = from_email

    # Кириллические (и любые non-ASCII) домены → punycode (IDNA).
    # Yandex Cloud Postbox (SESv2-совместимый) отклоняет raw-кириллицу в
    # ToAddresses/FromEmailAddress с BadRequest «invalid address».
    # Кодируем только доменную часть: «32@32вряд.рф» → «32@xn--...».
    to_email = _encode_email_domain(to_email)
    from_addr = _encode_email_domain(from_addr)
    if reply_to:
        reply_to = _encode_email_domain(reply_to)

    # Тело: HTML приоритет, text как fallback.
    body: dict = {}
    if html_body:
        body["Html"] = {"Data": html_body}
    if text_body or not html_body:
        body["Text"] = {"Data": text_body or ""}

    def _do_send() -> dict:
        client = _build_client(access_key_id, secret_access_key, region)
        # Reply-To: если задан, передаём как отдельный параметр send_email
        # (НЕ внутри Destination — это AWS SESv2 API контракт). Лид, отвечая,
        # шлёт письмо на reply_to, а не на системный From.
        kwargs: dict = dict(
            FromEmailAddress=from_addr,
            Destination={"ToAddresses": [to_email]},
            Content={
                "Simple": {
                    "Subject": {"Data": subject or "(без темы)"},
                    "Body": body,
                }
            },
        )
        if reply_to:
            kwargs["ReplyToAddresses"] = [reply_to]
        return client.send_email(**kwargs)

    try:
        # anyio.to_thread.run_sync — корректный способ запустить sync-функцию
        # в потоке из async-context без блокировки event loop.
        response = await anyio.to_thread.run_sync(_do_send)
    except Exception as e:
        # boto3 кидает ClientError с подробным описанием. Логируем и упаковываем.
        msg = str(e)
        logger.warning("Postbox HTTP send_email failed: %s", msg)
        # Различаем типичные сценарии по тексту ошибки boto3.
        low = msg.lower()
        if "access denied" in low or "unauthorized" in low:
            return_code = "not_configured"
        elif "throttling" in low or "rate" in low:
            return_code = "http_error"
        else:
            return_code = "http_error"
        raise PostboxHTTPError(f"Postbox API: {msg[:300]}", code=return_code) from e

    message_id = response.get("MessageId")
    if not message_id:
        raise PostboxHTTPError(
            "Postbox API вернул ответ без MessageId",
            code="no_message_id",
        )
    return str(message_id)


async def verify_credentials(
    access_key_id: str, secret_access_key: str, region: str = DEFAULT_REGION
) -> tuple[bool, Optional[str]]:
    """Проверка кредентиалов для тест-эндпоинта /test.

    Postbox SESv2 не имеет dedicated getSendQuota для не-AWS, поэтому
    делаем тестовую попытку send_email на специальный invalid-адрес и
    смотрим тип ошибки: если 403/auth — ключи плохие, если что-то про
    content/destination — ключи ок (значит подпись принята).

    Возвращает (ok, error_message?).
    """
    if not access_key_id or not secret_access_key:
        return False, "Не заданы API-key ID/секрет"

    import anyio

    # Строки в тексте ошибки, означающие auth/сигнатуру-проблему.
    # Внимание: bare 'Forbidden' (от ycalb-балансировщика) тоже сюда входит —
    # без этого кейса 403 без XML-тела ошибочно классифицировался как «ключи ок».
    _AUTH_FAIL_MARKERS = (
        "accessdenied",
        "unauthorized",
        "invalidclienttokenid",
        "forbidden",
        "signaturedoesnotmatch",
        "invalididentitytoken",
    )

    def _do_probe() -> tuple[bool, Optional[str]]:
        try:
            client = _build_client(access_key_id, secret_access_key, region)
            # get_dedicated_ip — лёгкий endpoint, который требует auth,
            # но не делает реальной отправки. Если вернётся auth-ошибка —
            # значит ключи не валидны. Если 404/прочее про ресурс — ключи ок.
            try:
                client.get_dedicated_ip(ip="0.0.0.0")
                return True, None
            except Exception as e:
                # Достаём HTTP-статус из response metadata botocore.
                status = None
                if hasattr(e, "response"):
                    meta = e.response.get("ResponseMetadata", {}) or {}
                    status = meta.get("HTTPStatusCode")
                low = str(e).lower()
                # Auth-ошибка: либо 401/403 статус, либо знакомая строка.
                if status in (401, 403) or any(marker in low for marker in _AUTH_FAIL_MARKERS):
                    return False, f"Ключи отклонены (HTTP {status}): {str(e)[:200]}"
                # Любая другая ошибка (400/404/409 про сам ресурс) = подпись
                # принята сервером → ключи валидны.
                return True, None
        except Exception as e:
            return False, f"network/internal: {str(e)[:200]}"

    return await anyio.to_thread.run_sync(_do_probe)
