"""Антиспам для публичной формы website_leads.

Без капчи и без внешних сервисов — проверки в порядке от дешёвых
к дорогим:

  1. Honeypot (см. service.submit_lead) — отсекает наивные boты.
  2. User-Agent фильтр — отсекает curl / requests / Scrapy / headless.
  3. Server-issued one-shot token + time-trap. На render формы фронт
     запрашивает токен по `POST /website-leads/token`. Токен —
     `nonce:timestamp:hmac(SECRET_KEY)`. При submit фронт шлёт его
     обратно + `fill_time_ms`. Бэк проверяет:
       - HMAC подпись валидна
       - возраст токена 3 сек … 30 минут
       - `fill_time_ms ≥ 3000` (бот заполнит за миллисекунды)
       - токен не использовался ранее (Redis SET NX TTL=30 мин)
     Бот теперь обязан: (а) сначала фетчнуть токен; (б) подождать
     3 секунды; (в) не отправлять один токен дважды. Это всё ещё
     обходится, но стоит на порядок больше работы.
  4. Дедуп `(ip, contact)` на 24 часа через Redis SET NX. Один и тот
     же контакт с одного IP за сутки = тихо отбрасываем.

Все ошибки антиспама в service преобразуются в тот же 200/ok —
бот не должен узнавать, какая именно проверка его поймала.

Redis недоступен → fail-open: проверки one-shot и dedup пропускаются,
HMAC и time-trap всё ещё работают. Реальный юзер не должен страдать
из-за инфраструктурного сбоя.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import re
import secrets
import time
from typing import Optional

from app.core.config import settings
from app.core.redis_pubsub import get_redis

logger = logging.getLogger(__name__)


MIN_FILL_TIME_MS = 3000
MAX_TOKEN_AGE_S = 30 * 60
DEDUP_TTL_S = 24 * 60 * 60
USED_TOKEN_TTL_S = MAX_TOKEN_AGE_S


_BOT_UA_RE = re.compile(
    r"(python-requests|aiohttp|scrapy|curl/|wget/|httpie|libwww|java/|"
    r"go-http-client|httpclient|okhttp|headless|phantomjs|puppeteer|"
    r"playwright|crawler|spider|slurp)",
    re.IGNORECASE,
)


def issue_form_token() -> str:
    """Выдаёт одноразовый токен формы: `nonce:timestamp:hmac`."""
    nonce = secrets.token_urlsafe(12)
    ts = str(int(time.time()))
    payload = f"{nonce}:{ts}"
    sig = hmac.new(
        settings.SECRET_KEY.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()[:32]
    return f"{payload}:{sig}"


def _verify_signature(token: str) -> Optional[tuple[str, int]]:
    parts = token.split(":")
    if len(parts) != 3:
        return None
    nonce, ts_str, sig = parts
    if not nonce or not ts_str or not sig:
        return None
    expected = hmac.new(
        settings.SECRET_KEY.encode(),
        f"{nonce}:{ts_str}".encode(),
        hashlib.sha256,
    ).hexdigest()[:32]
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        ts = int(ts_str)
    except ValueError:
        return None
    return (nonce, ts)


async def verify_form_token(token: str, fill_time_ms: int) -> tuple[bool, str]:
    """Проверка токена + time-trap.

    Возвращает (ok, reason). reason — короткий код для логов.
    Никогда не показывается юзеру (см. модуль-docstring).
    """
    if not token:
        return False, "no_token"
    parsed = _verify_signature(token)
    if not parsed:
        return False, "bad_signature"
    _, ts = parsed
    age = int(time.time()) - ts
    if age < 0 or age > MAX_TOKEN_AGE_S:
        return False, "token_expired"
    if fill_time_ms < MIN_FILL_TIME_MS:
        return False, "too_fast"

    # One-shot: токен не должен использоваться дважды. Redis-fail-open.
    nonce = parsed[0]
    try:
        redis = get_redis()
        key = f"website_lead:used_token:{nonce}"
        ok = await redis.set(key, "1", ex=USED_TOKEN_TTL_S, nx=True)
        if not ok:
            return False, "token_reuse"
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "antispam.redis_unavailable check=used_token err=%r", exc
        )

    return True, "ok"


def is_bot_ua(user_agent: str) -> bool:
    """True если UA похож на скрипт. Пустой UA — тоже True."""
    if not user_agent or len(user_agent) < 8:
        return True
    return bool(_BOT_UA_RE.search(user_agent))


async def check_dedup(ip: str, contact: str) -> bool:
    """True = можно создавать. False = был такой же `(ip, contact)` за 24ч.

    Redis-fail-open: при недоступности Redis считаем дедуп пройденным.
    """
    if not ip or not contact:
        return True
    try:
        redis = get_redis()
        digest = hashlib.sha256(contact.strip().lower().encode()).hexdigest()[:24]
        key = f"website_lead:dedup:{ip}:{digest}"
        ok = await redis.set(key, "1", ex=DEDUP_TTL_S, nx=True)
        return bool(ok)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "antispam.redis_unavailable check=dedup err=%r", exc
        )
        return True
