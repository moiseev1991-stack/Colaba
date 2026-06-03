"""HTML-парсер карточки Я.Карт через headless Chromium (Playwright).

yandex.ru/maps/org/<external_id>/ — SPA. Прямой httpx.get отдаёт только HTML-shell
без контента (всё рендерится JS-ом). Поэтому контакты тянем через настоящий браузер.

Стратегия:
  1) Запускаем headless Chromium через Playwright, открываем карточку.
  2) Ждём networkidle + рендер блока контактов (`.card-feature-view__content`).
  3) Кликаем по кнопке «Показать телефон», если есть — раскрывает дополнительные
     номера. Молча игнорируем если не найдена.
  4) После рендера берём `page.content()` и гоним regex (tel:, mailto:, t.me,
     vk.com, wa.me, instagram, facebook, ok.ru, youtube) поверх. Селекторы
     меняются от релиза к релизу, regex по сырому HTML надёжнее.

Ограничения:
- Один таск ≈ 8-12 секунд (старт браузера + загрузка + ожидание сети + клик).
- Один Chromium-процесс ≈ 200-400MB RAM. Per-task. На VPS 3.8GB при
  concurrency=1 безопасно.
- Никогда не бросает исключений: при любой ошибке возвращает ContactEnrichResult
  с error.
"""

from __future__ import annotations

import logging
import re
from urllib.parse import urlparse

from app.modules.maps.enrich import (
    ContactEnrichResult,
    _accept_email,
    _normalize_phone,
)
from app.modules.searches.providers.common import get_proxy_config

logger = logging.getLogger(__name__)

_CARD_URL = "https://yandex.ru/maps/org/{external_id}/"

_PAGE_TIMEOUT_MS = 25_000
_NETWORK_IDLE_TIMEOUT_MS = 12_000
_SHOW_PHONE_TIMEOUT_MS = 2_000
_POST_RENDER_WAIT_MS = 1_500

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
)
_SEC_CH_UA_HEADERS = {
    "Sec-Ch-Ua": '"Chromium";v="148", "Not.A/Brand";v="24", "Google Chrome";v="148"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
}

# Домены, которые НЕ являются сайтом компании на Я.Картах. Сам Яндекс,
# его собственные telegram/vk/max-шортлинки, рекламные и трекерные домены.
_WEBSITE_EXCLUDE_HOSTS = (
    "yandex.",
    "yastatic.",
    "ya.ru",
    "mc.yandex",
    "kinopoisk.ru",
    "music.yandex",
    "dzen.ru",
    "max.ru",          # Yandex Max шортлинк
    "max.app",
    "mail.ru",
    "ok.ru",
    "ads.adfox",
    "adfox.ru",
    "google.com",
    "googleapis.com",
    "gstatic.com",
    "googletagmanager",
    "google-analytics",
    "doubleclick",
    "schema.org",
    "w3.org",
    "2gis.",
)

# Yandex-собственные аккаунты в соцсетях/мессенджерах. На карточках встречаются
# в футере / ссылках «о приложении». Отбрасываем.
_SOCIAL_EXCLUDE_HANDLES = {
    "yandex", "yandexmaps", "yandex_maps", "yandex.maps", "mapsyandex",
    "ya_news", "yandex_news", "yandex_official", "yandexapps",
}


def _looks_like_real_ru_phone(normalized: str) -> bool:
    """Валидный российский +7XXXXXXXXXX: после +7 идёт цифра 3-9.

    Отбрасывает мусор типа +70123456789 (нет в РФ кодов с лидирующим 0/1/2)
    и +7XXX0... которые лезут из JS-конфигов Я.Карт (timestamps типа `7 0 0 0 12`).
    """
    if not normalized or len(normalized) != 12 or not normalized.startswith("+7"):
        return False
    first_after_7 = normalized[2]
    return first_after_7 in "3456789"

# Регексы для соцсетей/мессенджеров (часть совпадает с enrich.py для 2GIS,
# но карточки Я.Карт отдают чистые URL внутри ссылок, без link.2gis.ru обёрток).
_RE_TEL = re.compile(r'href="tel:([^"]+)"', re.IGNORECASE)
_RE_MAILTO = re.compile(r'href="mailto:([^"]+)"', re.IGNORECASE)
_RE_TELEGRAM = re.compile(r'https?://(?:t\.me|telegram\.me)/([A-Za-z0-9_]+)', re.IGNORECASE)
_RE_VK = re.compile(r'https?://(?:vk\.com|vk\.ru|vkontakte\.ru)/([A-Za-z0-9_\.\-]+)', re.IGNORECASE)
_RE_WHATSAPP = re.compile(r'https?://(?:wa\.me|api\.whatsapp\.com)/(?:send\?phone=)?(\+?\d+)', re.IGNORECASE)
_RE_INSTAGRAM = re.compile(r'https?://(?:www\.)?instagram\.com/([A-Za-z0-9_\.]+)', re.IGNORECASE)
_RE_FACEBOOK = re.compile(r'https?://(?:www\.)?(?:facebook\.com|fb\.com)/([A-Za-z0-9_\.]+)', re.IGNORECASE)
_RE_OK = re.compile(r'https?://(?:www\.)?(?:ok\.ru|odnoklassniki\.ru)/([A-Za-z0-9_\.\-]+)', re.IGNORECASE)
_RE_YOUTUBE = re.compile(r'https?://(?:www\.)?(?:youtube\.com|youtu\.be)/([A-Za-z0-9_\-/@]+)', re.IGNORECASE)
_RE_HREF_HTTPS = re.compile(r'href="(https?://[^"]+)"', re.IGNORECASE)
# Телефоны — российский формат +7/8 (NNN) NNN-NN-NN с любыми разделителями
_RE_PHONE_RU = re.compile(r'(?:\+7|8)[\s\-\(\)]*\d{3}[\s\-\(\)]*\d{3}[\s\-\(\)]*\d{2}[\s\-\(\)]*\d{2}')


def _playwright_proxy_from_url(proxy_url: str | None) -> dict[str, str] | None:
    """http://user:pass@host:port → {server, username, password}. None если нет."""
    if not proxy_url:
        return None
    p = urlparse(proxy_url)
    if not p.hostname or not p.port:
        return None
    out: dict[str, str] = {"server": f"{p.scheme or 'http'}://{p.hostname}:{p.port}"}
    if p.username:
        out["username"] = p.username
    if p.password:
        out["password"] = p.password
    return out


def _pick_external_website(html: str) -> str | None:
    """Первая внешняя http(s) ссылка из карточки Я.Карт, не из exclude-списка."""
    for raw in _RE_HREF_HTTPS.findall(html):
        try:
            host = urlparse(raw).netloc.lower()
        except Exception:
            continue
        if not host:
            continue
        if any(bad in host for bad in _WEBSITE_EXCLUDE_HOSTS):
            continue
        # Соцсети — не «сайт» в смысле основного сайта компании
        if any(s in host for s in ("t.me", "telegram.", "vk.com", "vk.ru",
                                    "wa.me", "whatsapp.", "instagram.",
                                    "facebook.", "fb.com", "ok.ru",
                                    "odnoklassniki.", "youtube.", "youtu.be")):
            continue
        return raw
    return None


def _extract_phones_from_block(block_html: str, result: ContactEnrichResult) -> None:
    """Парсит телефоны ТОЛЬКО из переданного узкого блока DOM (а не из всей страницы).

    Нужно потому что в полном HTML карточки Я.Карт лежит куча JS-конфигов с длинными
    числовыми токенами (timestamps, IDs), которые `_RE_PHONE_RU` распознаёт как
    валидные RU-номера — и в БД попадает 20+ мусорных номеров.

    На вход подавать `inner_html` элементов `[class*='card-phones']` или
    `[class*='phones-section']` — это блок «Телефоны» в карточке организации.
    """
    if not block_html:
        return
    for raw in _RE_TEL.findall(block_html):
        n = _normalize_phone(raw)
        if n and _looks_like_real_ru_phone(n) and n not in result.phones:
            result.phones.append(n)
    for raw in _RE_PHONE_RU.findall(block_html):
        n = _normalize_phone(raw)
        if n and _looks_like_real_ru_phone(n) and n not in result.phones:
            result.phones.append(n)


def _extract_from_html(html: str, result: ContactEnrichResult) -> None:
    """Парсит соцсети / email / website / fallback-телефоны из полного HTML.

    Phones по полному HTML НЕ ловим (мусор из JS) — для них есть отдельная
    `_extract_phones_from_block`, вызываемая с узким DOM-блоком.

    Здесь оставлен только tel:-ссылки — они редко попадают в JS-мусор и
    являются надёжным сигналом телефона.
    """
    if not html:
        return

    # Только tel: — это валидный href с маркером телефона, мусор в JS не имеет tel:
    for raw in _RE_TEL.findall(html):
        n = _normalize_phone(raw)
        if n and _looks_like_real_ru_phone(n) and n not in result.phones:
            result.phones.append(n)

    # Email
    for raw in _RE_MAILTO.findall(html):
        e = (raw or "").strip().lower().split("?")[0]
        if _accept_email(e) and e not in result.emails:
            result.emails.append(e)

    # Telegram — фильтр на Yandex-аккаунты
    for handle in _RE_TELEGRAM.findall(html):
        if handle.lower() in _SOCIAL_EXCLUDE_HANDLES:
            continue
        tg = f"https://t.me/{handle}"
        if tg not in result.telegrams:
            result.telegrams.append(tg)

    # VK — фильтр на Yandex-аккаунты (vk.com/yandex.maps и т.п.)
    for handle in _RE_VK.findall(html):
        if handle.lower() in _SOCIAL_EXCLUDE_HANDLES:
            continue
        vk = f"https://vk.com/{handle}"
        if vk not in result.vks:
            result.vks.append(vk)

    # WhatsApp
    for num in _RE_WHATSAPP.findall(html):
        wa = f"https://wa.me/{num.lstrip('+')}"
        if wa not in result.whatsapps:
            result.whatsapps.append(wa)

    # Instagram / Facebook / OK / YouTube
    for handle in _RE_INSTAGRAM.findall(html):
        ig = f"https://instagram.com/{handle}"
        if ig not in result.instagrams:
            result.instagrams.append(ig)
    for handle in _RE_FACEBOOK.findall(html):
        if handle.lower() in _SOCIAL_EXCLUDE_HANDLES:
            continue
        fb = f"https://facebook.com/{handle}"
        if fb not in result.facebooks:
            result.facebooks.append(fb)
    for handle in _RE_OK.findall(html):
        ok = f"https://ok.ru/{handle}"
        if ok not in result.oks:
            result.oks.append(ok)
    for handle in _RE_YOUTUBE.findall(html):
        yt = f"https://youtube.com/{handle}"
        if yt not in result.youtubes:
            result.youtubes.append(yt)

    # Website компании
    if not result.website:
        result.website = _pick_external_website(html)


async def enrich_from_yandex_card(external_id: str) -> ContactEnrichResult:
    """Тянет контакты компании с карточки yandex.ru/maps/org/<external_id>/.

    Возвращает ContactEnrichResult с phones / website / соцсетями / emails.
    При любой ошибке (нет Playwright, нет прокси, таймаут) возвращает result
    с error и пустыми полями. Не бросает исключений.
    """
    result = ContactEnrichResult()
    if not external_id:
        result.error = "no_external_id"
        return result

    url = _CARD_URL.format(external_id=external_id)
    result.fetched_url = url

    proxy_url = get_proxy_config()
    proxy_arg = _playwright_proxy_from_url(proxy_url)

    try:
        from playwright.async_api import async_playwright, TimeoutError as PWTimeout
    except ImportError as e:
        result.error = f"playwright not installed: {e}"
        return result

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(
                headless=True,
                proxy=proxy_arg,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                ],
            )
            try:
                ctx = await browser.new_context(
                    user_agent=_UA,
                    locale="ru-RU",
                    viewport={"width": 1366, "height": 900},
                    extra_http_headers={
                        "Accept-Language": "ru-RU,ru;q=0.9",
                        **_SEC_CH_UA_HEADERS,
                    },
                )
                page = await ctx.new_page()
                try:
                    await page.goto(url, wait_until="domcontentloaded", timeout=_PAGE_TIMEOUT_MS)
                except PWTimeout:
                    result.error = "page goto timeout"
                    return result

                # Капча на странице карточки — редко, но бывает
                if "/showcaptcha" in page.url.lower() or "/checkcaptcha" in page.url.lower():
                    result.error = "captcha on card page"
                    return result

                # Ждём появления блока контактов или networkidle
                try:
                    await page.wait_for_selector(".card-feature-view__content", timeout=_NETWORK_IDLE_TIMEOUT_MS)
                except PWTimeout:
                    pass  # не критично — попробуем парсить что есть
                try:
                    await page.wait_for_load_state("networkidle", timeout=_NETWORK_IDLE_TIMEOUT_MS)
                except PWTimeout:
                    pass

                # Раскрываем дополнительные телефоны (часто рядом есть кнопка
                # «Показать телефон»). Игнорируем если не нашли.
                try:
                    show_phone = page.get_by_text("Показать телефон", exact=False).first
                    await show_phone.click(timeout=_SHOW_PHONE_TIMEOUT_MS)
                    await page.wait_for_timeout(800)
                except Exception:
                    pass

                await page.wait_for_timeout(_POST_RENDER_WAIT_MS)

                # Телефоны — строго из узких phone-блоков, чтобы не цеплять
                # числовые токены из JS-конфигов.
                phone_selectors = [
                    "[class*='card-phones']",
                    "[class*='phones-section']",
                    "[class*='card-phone-view']",
                    "[class*='card-phone-button']",
                ]
                for sel in phone_selectors:
                    try:
                        for el in await page.query_selector_all(sel):
                            try:
                                inner = await el.inner_html()
                                _extract_phones_from_block(inner, result)
                            except Exception:
                                pass
                    except Exception:
                        pass

                html = await page.content()
                _extract_from_html(html, result)

            finally:
                await browser.close()
    except Exception as e:
        result.error = f"{type(e).__name__}: {str(e)[:200]}"

    return result
