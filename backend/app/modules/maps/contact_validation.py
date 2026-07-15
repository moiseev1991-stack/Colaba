"""Валидация контактов ЛПР (email/phone) перед сохранением в БД.

Юзер (Дима, 15.07): «сейчас в БД идут все pr@, info@, smm@ без проверки.
Мы жжём КП на dead emails. Добавь MX-check + фильтр очевидных мусорных
доменов и placeholder-номеров».

Правила email
-------------
1. Формат — через email_validator (RFC syntax check).
2. Blacklist local-part: noreply/no-reply/mailer-daemon/postmaster/abuse
   и placeholder'ы example/test/user/your.
3. Blacklist доменов: example.com, sentry.io, wixpress.com, godaddy.com,
   cloudflare.com — placeholder'ы или инфра-адреса из HTML-темплейтов.
4. MX-check (dnspython): у домена должна быть MX-запись — иначе письмо
   заведомо не дойдёт. Кэш LRU 2048 доменов.

Правила phone (RU)
------------------
1. Нормализация +7/8 → +7XXXXXXXXXX (E.164, 11 цифр).
2. Blacklist test-номеров: +70000000000, +79999999999, +77777777777, etc.
3. Оператор-код (цифры 2-4): 3xx/4xx = стационарный, 8xx = сервисные,
   9xx = мобильный. Всё остальное — мусор.
4. Все одинаковые цифры (+71111111111) — отсекаем.

MX-check блокирующий (dnspython). В async-контексте используй
`is_valid_email_async` — он оборачивает через asyncio.to_thread, чтобы
не блокировать event loop celery/uvicorn.
"""

from __future__ import annotations

import asyncio
import functools
import logging
import re


logger = logging.getLogger(__name__)


# Local-part-и которые точно не являются рабочим ящиком человека.
_EMAIL_LOCAL_BLACKLIST = frozenset({
    "noreply", "no-reply", "donotreply", "do-not-reply",
    "mailer-daemon", "postmaster", "abuse", "bounce", "bounces",
    "example", "test", "user", "your", "name", "email",
})

# Домены, на которые точно нет смысла писать (placeholder'ы CMS/инфра).
_EMAIL_DOMAIN_BLACKLIST_SUFFIX: tuple[str, ...] = (
    "example.com", "example.ru", "example.org", "example.net",
    "domain.com", "domain.ru", "yourdomain.com", "yourdomain.ru",
    "test.com", "test.ru", "localhost",
    "sentry.io", "wixpress.com", "wix.com",
    "cloudflare.com", "godaddy.com", "shopify.com",
)

# Номера, которые часто используются как placeholder / тестовые.
_PHONE_BLACKLIST = frozenset({
    "+70000000000", "+79999999999", "+77777777777",
    "+71111111111", "+72222222222", "+73333333333",
    "+74444444444", "+75555555555", "+76666666666",
    "+78888888888",
    "+71234567890", "+70123456789",
})


@functools.lru_cache(maxsize=2048)
def _domain_has_mx(domain: str) -> bool:
    """MX-lookup с процесс-локальным LRU-кэшем.

    Возвращает True если у домена есть хоть одна MX-запись.
    Blocking DNS call — вызывающий код в async-контексте должен обернуть
    в asyncio.to_thread. Timeout 3с — MX-lookup обычно занимает <100мс,
    но с плохим DNS может залипнуть.
    """
    try:
        import dns.resolver
        answers = dns.resolver.resolve(domain, "MX", lifetime=3.0)
        return len(answers) > 0
    except Exception as e:
        logger.debug("mx_check_failed domain=%s err=%s", domain, e)
        return False


def is_valid_email(
    email: str | None,
    check_mx: bool = True,
) -> tuple[bool, str, str]:
    """Проверяет email на пригодность для outreach.

    Returns (is_valid, reason, normalized_email).
        is_valid   — True если можно писать.
        reason     — короткий машинный код причины ('no_mx', 'blacklist_local',
                     'bad_local_length'…). Пустой если valid.
        normalized — email в нижнем регистре с trim, если valid; иначе "".

    check_mx=False пропускает DNS-lookup (полезно на hot-path в playwright'е,
    где деньги времени дороже, чем деньги на bounce; MX-check потом сделает
    оркестратор при рассылке).
    """
    if not email or not isinstance(email, str):
        return False, "empty", ""
    e = email.strip().lower()
    if "@" not in e:
        return False, "no_at", ""

    local, _, domain = e.partition("@")
    if not local or not domain:
        return False, "bad_shape", ""
    if len(local) < 2 or len(local) > 64:
        return False, "bad_local_length", ""
    if local in _EMAIL_LOCAL_BLACKLIST:
        return False, "blacklist_local", ""
    if any(domain.endswith(sfx) for sfx in _EMAIL_DOMAIN_BLACKLIST_SUFFIX):
        return False, "blacklist_domain", ""
    # Sentry / analytics id: <hash>@o12345.ingest.sentry.io
    if "ingest.sentry" in domain:
        return False, "sentry_id", ""

    # Формальная проверка через email-validator.
    try:
        from email_validator import EmailNotValidError
        from email_validator import validate_email as _ev
        try:
            v = _ev(e, check_deliverability=False)
            normalized = v.normalized.lower()
        except EmailNotValidError as err:
            return False, f"invalid_format:{err.__class__.__name__}", ""
    except ImportError:
        # email-validator не установлен — regex-фолбэк.
        if not re.match(r"^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$", e):
            return False, "regex_fail", ""
        normalized = e

    if check_mx:
        if not _domain_has_mx(domain):
            return False, "no_mx", ""

    return True, "", normalized


async def is_valid_email_async(
    email: str | None,
    check_mx: bool = True,
) -> tuple[bool, str, str]:
    """Async-обёртка над is_valid_email. MX-lookup выполняется в потоке."""
    if not check_mx:
        return is_valid_email(email, check_mx=False)
    return await asyncio.to_thread(is_valid_email, email, True)


def is_valid_phone_ru(phone: str | None) -> tuple[bool, str, str]:
    """Валидация российского телефона.

    Returns (is_valid, reason, normalized_phone).
        normalized — в формате +7XXXXXXXXXX (E.164, 11 цифр).
    """
    if not phone or not isinstance(phone, str):
        return False, "empty", ""
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    if len(digits) == 10:
        digits = "7" + digits
    if len(digits) != 11 or not digits.startswith("7"):
        return False, "bad_length", ""
    normalized = "+" + digits
    if normalized in _PHONE_BLACKLIST:
        return False, "blacklist", ""
    # Оператор-код (цифра 2, т.е. digits[1]): 3=гор.МСК-СПб, 4=гор.регионы,
    # 8=сервисные (800/8-800), 9=мобильные. Остальное — мусор.
    if digits[1] not in ("3", "4", "8", "9"):
        return False, "bad_operator", ""
    # Все одинаковые цифры после кода страны (+7[1111111111])
    if len(set(digits[1:])) <= 1:
        return False, "all_same", ""
    return True, "", normalized
