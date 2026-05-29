"""Обогащение карточки компании контактами с её сайта.

Минимальный extractor: GET сайт компании → regex по HTML → email/телефоны/мессенджеры.

Принципы:
- Не валим таск из-за сетевых/HTML-ошибок: возвращаем пустой результат.
- Лимит размера тела ответа, чтобы не забить память на гигантских HTML.
- Один заход (homepage). /contacts, /kontakty и прочие — расширение позже,
  если окажется что homepage даёт мало контактов в реале.
- ContentEnrichResult — структурированный результат, который сервис кладёт
  в `companies.emails` и `companies.contacts_extra`.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

# Один email-regex. Не идеален (RFC 5322 не покрываем), но достаточно для
# типичного сайта SMB: support@клиника.ру, info@auto-service.рф и т.п.
# Юникод-домены тоже ловим (IDN сайты типа .рф).
_EMAIL_RE = re.compile(
    r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-а-яА-ЯёЁ]+\.[a-zA-Zа-яА-ЯёЁ]{2,}",
)

# tel:+7..., tel:8800..., tel:8(495)... — нормализуем дальше
_TEL_HREF_RE = re.compile(r'href=["\']tel:([^"\']+)["\']', re.IGNORECASE)
_TG_RE = re.compile(r'(?:t\.me|telegram\.me)/([A-Za-z0-9_]{3,})', re.IGNORECASE)
_VK_RE = re.compile(r'vk\.com/([A-Za-z0-9_.\-]{3,})', re.IGNORECASE)
_WA_RE = re.compile(r'(?:wa\.me|api\.whatsapp\.com/send\?phone=)/?\+?(\d{7,15})', re.IGNORECASE)

# Игнор-домены для emails: типовые «шумные» адреса систем/паблишеров, попадают
# в HTML рандомно, контактом компании не являются.
_EMAIL_DOMAIN_BLOCKLIST = {
    "sentry.io", "wixpress.com", "wordpress.com", "godaddy.com",
    "tilda.cc", "tildacdn.com", "tinkoff.ru",
    "example.com", "test.com", "domain.com",
}

# Лимиты
_DEFAULT_TIMEOUT = 8.0
_MAX_BYTES = 1_500_000   # 1.5 МБ HTML с головой хватит
_MAX_REDIRECTS = 3
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


@dataclass
class ContactEnrichResult:
    emails: list[str] = field(default_factory=list)
    phones: list[str] = field(default_factory=list)
    telegrams: list[str] = field(default_factory=list)
    vks: list[str] = field(default_factory=list)
    whatsapps: list[str] = field(default_factory=list)
    fetched_url: str | None = None
    error: str | None = None

    @property
    def is_empty(self) -> bool:
        return not (self.emails or self.phones or self.telegrams or self.vks or self.whatsapps)


def _normalize_phone(raw: str) -> str | None:
    """tel:8 (495) 123-45-67 → +74951234567. None если меньше 10 цифр."""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) < 10:
        return None
    if len(digits) == 10:
        return "+7" + digits
    if len(digits) == 11 and digits.startswith("8"):
        return "+7" + digits[1:]
    if len(digits) == 11 and digits.startswith("7"):
        return "+" + digits
    return "+" + digits


def _accept_email(email: str) -> bool:
    """Фильтр email: убираем шумные домены и почту длиной > 100."""
    if not email or len(email) > 100:
        return False
    if "@" not in email:
        return False
    domain = email.rsplit("@", 1)[1].lower()
    if domain in _EMAIL_DOMAIN_BLOCKLIST:
        return False
    # «info@» с обрезанным TLD типа info@домен — пропускаем
    if "." not in domain:
        return False
    return True


def _extract_from_html(html: str) -> ContactEnrichResult:
    """Чисто-функциональный extract из HTML-строки. Для тестов."""
    result = ContactEnrichResult()

    seen_emails: set[str] = set()
    for m in _EMAIL_RE.finditer(html):
        e = m.group(0).strip().rstrip(".,;:)")
        e_lower = e.lower()
        if _accept_email(e_lower) and e_lower not in seen_emails:
            seen_emails.add(e_lower)
            result.emails.append(e_lower)
        if len(result.emails) >= 10:
            break

    seen_phones: set[str] = set()
    for m in _TEL_HREF_RE.finditer(html):
        phone = _normalize_phone(m.group(1))
        if phone and phone not in seen_phones:
            seen_phones.add(phone)
            result.phones.append(phone)
        if len(result.phones) >= 5:
            break

    for m in _TG_RE.finditer(html):
        handle = m.group(1).lower()
        if handle not in result.telegrams and handle not in {"share", "joinchat"}:
            result.telegrams.append(handle)
        if len(result.telegrams) >= 5:
            break

    for m in _VK_RE.finditer(html):
        handle = m.group(1).lower()
        if handle not in result.vks and handle not in {"share", "video", "audio", "doc"}:
            result.vks.append(handle)
        if len(result.vks) >= 5:
            break

    for m in _WA_RE.finditer(html):
        wa = "+" + m.group(1)
        if wa not in result.whatsapps:
            result.whatsapps.append(wa)
        if len(result.whatsapps) >= 5:
            break

    return result


async def fetch_and_extract(website: str, *, timeout: float = _DEFAULT_TIMEOUT) -> ContactEnrichResult:
    """Главная функция: GET сайт → extract.

    Никогда не бросает: при ошибке сети/HTML возвращает result с `error` и
    остальное пустое.
    """
    if not website:
        return ContactEnrichResult(error="empty website")

    url = website.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    try:
        parsed = urlparse(url)
        if not parsed.netloc:
            return ContactEnrichResult(error="invalid url")
    except Exception:
        return ContactEnrichResult(error="invalid url")

    headers = {
        "User-Agent": _UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
    }

    try:
        async with httpx.AsyncClient(
            timeout=timeout,
            follow_redirects=True,
            max_redirects=_MAX_REDIRECTS,
            headers=headers,
        ) as client:
            resp = await client.get(url)
            if resp.status_code >= 400:
                return ContactEnrichResult(
                    error=f"http {resp.status_code}", fetched_url=str(resp.url)
                )
            # Ограничиваем размер тела
            body = resp.content[:_MAX_BYTES]
            ctype = (resp.headers.get("content-type") or "").lower()
            if "html" not in ctype and "text" not in ctype:
                # PDF, бинарь и пр. — обрабатывать нет смысла
                return ContactEnrichResult(
                    error=f"content-type {ctype!r}", fetched_url=str(resp.url)
                )

            # decode безопасно
            try:
                html = body.decode(resp.encoding or "utf-8", errors="ignore")
            except (LookupError, TypeError):
                html = body.decode("utf-8", errors="ignore")

            result = _extract_from_html(html)
            result.fetched_url = str(resp.url)
            return result
    except httpx.TimeoutException:
        return ContactEnrichResult(error="timeout")
    except httpx.HTTPError as e:
        return ContactEnrichResult(error=f"http error: {type(e).__name__}")
    except Exception as e:
        logger.debug("fetch_and_extract: unexpected error for %r: %s", website, e)
        return ContactEnrichResult(error=f"unexpected: {type(e).__name__}")
