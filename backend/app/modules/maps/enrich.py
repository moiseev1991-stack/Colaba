"""Обогащение карточки компании контактами с её сайта.

Минимальный extractor: GET сайт компании → regex по HTML → email/телефоны/мессенджеры.
Дополнительно проходим по /contacts, /kontakty, /contact, /about — там у SMB
обычно лежит полная подборка контактов, главная страница нередко содержит
только email + телефон.

Принципы:
- Не валим таск из-за сетевых/HTML-ошибок: возвращаем пустой результат.
- Лимит размера тела ответа, чтобы не забить память на гигантских HTML.
- Лимит количества контактных страниц (до 3 после homepage) — иначе тяжёлый
  сайт может съесть 10+ секунд.
- ContentEnrichResult — структурированный результат, который сервис кладёт
  в `companies.emails` и `companies.contacts_extra`.
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse

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
# Доп. соц.сети — ловим в footers/headers практически всех сайтов.
_INSTA_RE = re.compile(r'instagram\.com/([A-Za-z0-9_.\-]{3,})', re.IGNORECASE)
_FB_RE = re.compile(r'facebook\.com/([A-Za-z0-9_.\-]{3,})', re.IGNORECASE)
_OK_RE = re.compile(r'ok\.ru/(?:profile/)?([A-Za-z0-9_.\-]{3,})', re.IGNORECASE)
_YT_RE = re.compile(r'youtube\.com/(?:c/|channel/|user/|@)([A-Za-z0-9_.\-]{3,})', re.IGNORECASE)

# Ссылки на типовые «контактные» страницы у российских и не-российских сайтов.
# Порядок важен: первые с большей вероятностью имеют полный набор контактов.
_CONTACT_PATHS = (
    "/contacts", "/contact", "/kontakty", "/kontakti",
    "/about", "/o-nas", "/o-kompanii",
)
# Сколько доп. страниц мы пробуем (после homepage).
_MAX_EXTRA_PAGES = 3
# Чёрный список handles для соцсетей — путаются с share-кнопками.
_SOCIAL_HANDLE_BLOCKLIST = {
    "share", "sharer", "joinchat", "video", "audio", "doc",
    "tr", "pages", "groups", "plugins", "dialog", "intent",
    "explore", "p", "reel", "reels", "stories", "watch",
}

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
    instagrams: list[str] = field(default_factory=list)
    facebooks: list[str] = field(default_factory=list)
    oks: list[str] = field(default_factory=list)
    youtubes: list[str] = field(default_factory=list)
    # website компании (если нашли в XHR Catalog API карточки 2GIS — type='website',
    # или в текстовом содержимом ссылок с link.2gis.ru/url?...). На нашем плане
    # 2GIS Catalog API contact_groups часто пустые → website NULL, что ломает
    # пресет «Есть сайт» (он отдаёт 0 компаний). Поэтому Playwright должен
    # доставать website тоже и пробрасывать в companies.website.
    website: str | None = None
    fetched_url: str | None = None
    error: str | None = None

    @property
    def is_empty(self) -> bool:
        return not (
            self.emails or self.phones or self.telegrams or self.vks or self.whatsapps
            or self.instagrams or self.facebooks or self.oks or self.youtubes
            or self.website
        )

    def merge(self, other: "ContactEnrichResult") -> None:
        """Слить контакты из other в self (для контента нескольких страниц).
        Дедуп по value, сохраняем порядок первого вхождения.
        """
        for attr in ("emails", "phones", "telegrams", "vks", "whatsapps",
                     "instagrams", "facebooks", "oks", "youtubes"):
            existing = getattr(self, attr)
            existing_set = set(existing)
            for item in getattr(other, attr):
                if item not in existing_set:
                    existing.append(item)
                    existing_set.add(item)
        # website — первый непустой выигрывает (источники могут отдавать
        # разные UTM/redirect-формы одного и того же URL — оставляем первый
        # нашедшийся, его уже нормализуем дальше).
        if not self.website and other.website:
            self.website = other.website


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

    # Доп. соцсети — instagram/facebook/ok/youtube. Все одинаково: regex по
    # ссылкам в HTML, фильтр служебных handles. По 3 на каждую категорию —
    # больше не нужно, обычно одна-две на компанию.
    for regex, bucket in (
        (_INSTA_RE, result.instagrams),
        (_FB_RE, result.facebooks),
        (_OK_RE, result.oks),
        (_YT_RE, result.youtubes),
    ):
        for m in regex.finditer(html):
            handle = m.group(1).lower().rstrip("/")
            if handle in _SOCIAL_HANDLE_BLOCKLIST or handle in bucket:
                continue
            bucket.append(handle)
            if len(bucket) >= 3:
                break

    return result


async def _fetch_html(client: httpx.AsyncClient, url: str) -> tuple[str | None, str | None, str | None]:
    """Один GET с фильтром по content-type. Возвращает (html, final_url, error)."""
    try:
        resp = await client.get(url)
    except httpx.TimeoutException:
        return None, None, "timeout"
    except httpx.HTTPError as e:
        return None, None, f"http error: {type(e).__name__}"
    except Exception as e:
        logger.debug("_fetch_html: unexpected error for %r: %s", url, e)
        return None, None, f"unexpected: {type(e).__name__}"

    if resp.status_code >= 400:
        return None, str(resp.url), f"http {resp.status_code}"
    body = resp.content[:_MAX_BYTES]
    ctype = (resp.headers.get("content-type") or "").lower()
    if "html" not in ctype and "text" not in ctype:
        return None, str(resp.url), f"content-type {ctype!r}"
    try:
        html = body.decode(resp.encoding or "utf-8", errors="ignore")
    except (LookupError, TypeError):
        html = body.decode("utf-8", errors="ignore")
    return html, str(resp.url), None


async def fetch_and_extract(website: str, *, timeout: float = _DEFAULT_TIMEOUT) -> ContactEnrichResult:
    """Главная функция: GET homepage + до 3 «контактных» страниц → extract → merge.

    Никогда не бросает: при ошибке сети/HTML возвращает result с `error` и
    остальное пустое. Если homepage упал — расширенные страницы не пробуем
    (скорее всего сайт лежит / DNS).

    Между запросами небольшая asyncio.sleep(0.5) — не агрессивно для сайта SMB.
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

    merged = ContactEnrichResult()
    base_url: str | None = None
    homepage_error: str | None = None

    try:
        async with httpx.AsyncClient(
            timeout=timeout,
            follow_redirects=True,
            max_redirects=_MAX_REDIRECTS,
            headers=headers,
        ) as client:
            # Homepage — обязательный шаг.
            html, final_url, err = await _fetch_html(client, url)
            if err is not None:
                # Сайт совсем не отдаёт ничего — возвращаем error, не лезем
                # на /contacts (всё равно 404/timeout)
                merged.error = err
                merged.fetched_url = final_url
                return merged
            base_url = final_url or url
            merged.merge(_extract_from_html(html or ""))
            merged.fetched_url = base_url

            # Доп. страницы — best-effort. Если по факту это react-app и
            # homepage уже отдал нужное (нашли email/phone) — экономим, не
            # ходим дальше. Иначе пробуем contact-страницы.
            need_more = not merged.emails or not merged.phones
            if need_more:
                pages_tried = 0
                for path in _CONTACT_PATHS:
                    if pages_tried >= _MAX_EXTRA_PAGES:
                        break
                    extra_url = urljoin(base_url, path)
                    await asyncio.sleep(0.5)
                    sub_html, _, sub_err = await _fetch_html(client, extra_url)
                    if sub_err is not None or not sub_html:
                        continue
                    pages_tried += 1
                    merged.merge(_extract_from_html(sub_html))
                    # Если уже набрали и email и phone — хватит, не тратим запросы
                    if merged.emails and merged.phones:
                        break

            if homepage_error:
                merged.error = homepage_error
            return merged
    except Exception as e:
        logger.debug("fetch_and_extract: unexpected error for %r: %s", website, e)
        return ContactEnrichResult(error=f"unexpected: {type(e).__name__}")
