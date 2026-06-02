"""HTML-парсер карточки 2GIS через headless Chromium (Playwright).

2gis.ru/firm/{id} — это SPA (Single-Page Application). Прямой `httpx.get`
возвращает 11kB HTML-shell без контента — все данные грузятся JavaScript-ом
на клиенте. Поэтому контакты можно вытащить ТОЛЬКО через настоящий браузер.

Стратегия:
  1) Запускаем headless Chromium через Playwright, открываем страницу.
  2) Перехватываем XHR-ответы от `catalog.api.2gis.com` и `webapi.2gis.com` —
     именно туда SPA шлёт запрос за `contact_groups` с phone/email/мессенджерами.
     Эти ответы — структурный JSON, парсим точечно.
  3) Кликаем по кнопке «Показать телефон» если она есть — открывает скрытые
     номера. Молча игнорируем если не найдена.
  4) После рендера берём `document.body.innerText` и `page.content()` —
     гоним regex (tel:, mailto:, t.me, vk.com, wa.me, instagram, facebook,
     ok.ru, youtube) поверх. Это второй слой защиты на случай если XHR
     ответы перехватили не полностью.

Ограничения:
- Один таск ≈ 5-10 секунд (старт браузера + загрузка + ожидание сети).
- Один Chromium-процесс ≈ 200-400MB RAM. Запускается per-task, после
  закрытия память отдаётся ОС. На VPS 3.8GB при concurrency=1 безопасно.
- Никогда не бросает исключений: при любой ошибке (timeout, OOM, отсутствие
  Chromium в системе) возвращает ContactEnrichResult с error.
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

from app.modules.maps.enrich import (
    ContactEnrichResult,
    _extract_from_html,
    _normalize_phone,
    _accept_email,
)

logger = logging.getLogger(__name__)

_FIRM_URL = "https://2gis.ru/firm/{external_id}"

_PAGE_TIMEOUT_MS = 25_000        # навигация + первичный рендер
_NETWORK_IDLE_TIMEOUT_MS = 12_000  # 2GIS грузит десятки JS-чанков, нужно больше времени
_SHOW_PHONE_TIMEOUT_MS = 2_000    # клик по «Показать телефон» — не блокируем если нет
_POST_RENDER_WAIT_MS = 1_500      # доп. пауза после networkidle — даём XHR контактов долететь

# UA Chrome 148 — соответствует реальной версии нашего chromium-headless-shell
# (chromium-headless-shell v1223 = Chrome 148.0.7778). Со старым UA Chrome 124
# 2GIS перенаправлял на /museum («У вас не самый новый браузер») и реальные
# контакты не отдавались.
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
)

# Client Hints: без них 2GIS видит дефолтный sec-ch-ua headless-shell
# (`HeadlessChrome`) и также может детектить как бот. Подделываем как
# обычный Chrome 148.
_SEC_CH_UA_HEADERS = {
    "Sec-Ch-Ua": '"Chromium";v="148", "Not.A/Brand";v="24", "Google Chrome";v="148"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
}

# XHR-эндпоинты 2GIS, которые SPA-карточка дёргает за контактами.
# `catalog.api.2gis.com/3.0/items/byid` — главный, отдаёт contact_groups
# в том же формате что наш TwoGisProvider использует для search.
# `webapi.2gis.com` — иногда тоже релевантен (внутренние proxy-эндпоинты).
_API_HOSTS = ("catalog.api.2gis.com", "webapi.2gis.com")

# 2GIS оборачивает внешние сайты в трекер вида
#   https://link.2gis.ru/<id>?url=https%3A%2F%2Freal-site.ru%2F
# (старый формат — мы его поддерживаем как fallback). В новом формате
# (2026+) полезной нагрузки в query нет, payload base64-encoded в path:
#   https://link.2gis.ru/4.2/<id>/<base64>
# Поэтому надёжнее искать ПРЯМЫЕ ссылки `<a href="https://realsite.ru">`
# в HTML карточки — на firm-странице их обычно 0-2, и они и есть сайт
# компании. Соцсети/сервисные домены отфильтровываем по списку.
_WEBSITE_2GIS_LINK_RE = re.compile(
    r'https?://link\.2gis\.ru/[^"\s\'<>]*[?&]url=([^"\s\'<>&]+)',
    re.IGNORECASE,
)

# Прямые href в HTML 2gis-карточки. Извлекаем все http(s) ссылки —
# фильтр на 2gis/соцсети/служебные домены делаем в _pick_external_website.
_HREF_HTTP_RE = re.compile(r'href="(https?://[^"]+)"', re.IGNORECASE)

# Домены, которые НЕ являются сайтом компании: соцсети, мессенджеры,
# сам 2gis, маркеры аналитики и трекеры, общие сервисы.
_WEBSITE_EXCLUDE_HOSTS = (
    "2gis.",
    "2gis.com",
    "2gis.ru",
    "t.me",
    "telegram.me",
    "telegram.org",
    "wa.me",
    "whatsapp.com",
    "vk.com",
    "vk.ru",
    "vkontakte.ru",
    "instagram.com",
    "facebook.com",
    "fb.com",
    "ok.ru",
    "odnoklassniki.ru",
    "youtube.com",
    "youtu.be",
    "twitter.com",
    "x.com",
    "google.com",
    "googleapis.com",
    "gstatic.com",
    "yandex.ru",
    "ya.ru",
    "mc.yandex",
    "googletagmanager",
    "google-analytics",
    "doubleclick",
    "checkscan.ru",  # 2gis-трекер визитов
)


def _pick_external_website(html: str) -> str | None:
    """Ищет в HTML 2gis-карточки прямую ссылку на сайт компании.

    Берёт все `href="https?://..."`, отбрасывает 2gis-домены, соцсети,
    трекеры и сервисные домены, возвращает первую оставшуюся.
    """
    if not html:
        return None
    for raw in _HREF_HTTP_RE.findall(html):
        try:
            host = urlparse(raw).netloc.lower()
        except Exception:
            continue
        if not host:
            continue
        if any(bad in host for bad in _WEBSITE_EXCLUDE_HOSTS):
            continue
        return raw
    return None


def _normalize_2gis_url(raw: str) -> str | None:
    """Достаёт настоящий URL из 2GIS-трекинговых ссылок.

    2GIS оборачивает внешние сайты в трекер `link.2gis.ru/.../?url=...`
    (UTM и redirect). Если входной URL — такая обёртка, забираем оригинал
    из query `url`. Если просто http(s)-ссылка — возвращаем как есть. Если
    относительный/мусор — None.
    """
    if not raw:
        return None
    s = raw.strip()
    # Бывают значения типа "ya.ru" без схемы — добавим https:// на этапе
    # сохранения. Здесь только базовая валидация.
    try:
        # link.2gis.ru/...?url=...
        if "link.2gis.ru" in s or "/url?" in s:
            parsed = urlparse(s)
            qs = parse_qs(parsed.query)
            for key in ("url", "u"):
                if key in qs and qs[key]:
                    inner = unquote(qs[key][0])
                    if inner.startswith("http"):
                        return inner
            # ничего не нашли — отбрасываем (внутренний редирект без url=)
            return None
        if s.startswith(("http://", "https://")):
            return s
        # без схемы — допускаем «example.ru/...», добавим https://
        if "." in s and " " not in s and len(s) < 300:
            return "https://" + s.lstrip("/")
    except Exception:
        return None
    return None


def _walk_json_for_contacts(node: Any, result: ContactEnrichResult) -> None:
    """Рекурсивно обходит JSON-ответ 2GIS Catalog API и собирает контакты.

    Структура 2GIS contact_groups: список объектов с полем `contacts`, каждый
    элемент которого имеет `type` (phone/email/website/telegram/whatsapp/
    viber/vkontakte/instagram/facebook) и `value`. Обходим универсально:
    любой dict с парой type+value (или type+text) — кандидат на контакт.
    """
    if isinstance(node, dict):
        ctype_raw = node.get("type")
        ctype = ctype_raw.lower() if isinstance(ctype_raw, str) else ""
        value = node.get("value") or node.get("text") or node.get("url")
        if ctype and isinstance(value, str):
            v = value.strip()
            if ctype == "phone":
                n = _normalize_phone(v)
                if n and n not in result.phones and len(result.phones) < 5:
                    result.phones.append(n)
            elif ctype in ("website", "url") and v:
                # Нормализуем 2GIS-редиректы вида:
                #   https://link.2gis.ru/.../?url=https%3A//real-site.ru/
                # — выкусываем настоящий URL из query `url=`.
                normalized = _normalize_2gis_url(v)
                # Берём первый непустой website; повторно не перезаписываем.
                if normalized and not result.website:
                    result.website = normalized
            elif ctype == "email":
                el = v.lower()
                if _accept_email(el) and el not in result.emails and len(result.emails) < 10:
                    result.emails.append(el)
            elif ctype == "telegram" and v:
                handle = v.lstrip("@").lower()
                if "/" in handle:
                    handle = handle.rsplit("/", 1)[-1]
                if handle and handle not in result.telegrams and len(result.telegrams) < 5:
                    result.telegrams.append(handle)
            elif ctype == "whatsapp" and v:
                n = _normalize_phone(v)
                if n and n not in result.whatsapps and len(result.whatsapps) < 5:
                    result.whatsapps.append(n)
            elif ctype in ("vkontakte", "vk") and v:
                handle = v.rstrip("/").rsplit("/", 1)[-1].lower()
                if handle and handle not in result.vks and len(result.vks) < 5:
                    result.vks.append(handle)
            elif ctype == "instagram" and v:
                handle = v.lstrip("@").rstrip("/").rsplit("/", 1)[-1].lower()
                if handle and handle not in result.instagrams and len(result.instagrams) < 3:
                    result.instagrams.append(handle)
            elif ctype == "facebook" and v:
                handle = v.rstrip("/").rsplit("/", 1)[-1].lower()
                if handle and handle not in result.facebooks and len(result.facebooks) < 3:
                    result.facebooks.append(handle)

        for v in node.values():
            _walk_json_for_contacts(v, result)
    elif isinstance(node, list):
        for item in node:
            _walk_json_for_contacts(item, result)


async def fetch_and_extract_2gis_firm(external_id: str) -> ContactEnrichResult:
    """Headless Chromium → перехват XHR + regex по rendered innerText.

    Возвращает ContactEnrichResult с найденными контактами. При любой ошибке
    (timeout, отсутствие Chromium, навигация упала) — возвращает результат
    с заполненным `error` и пустыми списками.
    """
    if not external_id:
        return ContactEnrichResult(error="empty external_id")

    # Импорт внутри функции — если в окружении нет playwright (dev-машина без
    # установленного браузера), таск просто отдаст error="playwright missing",
    # а не упадёт при старте Celery-воркера.
    try:
        from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout
    except ImportError:
        return ContactEnrichResult(error="playwright not installed")

    url = _FIRM_URL.format(external_id=external_id)
    result = ContactEnrichResult()
    captured_jsons: list[Any] = []

    async def _on_response(response):
        """Перехватываем JSON-ответы от 2GIS Catalog API."""
        try:
            host = response.url.split("/", 3)[2] if "://" in response.url else ""
            if not any(api in host for api in _API_HOSTS):
                return
            ctype = (response.headers.get("content-type") or "").lower()
            if "json" not in ctype:
                return
            data = await response.json()
            captured_jsons.append(data)
        except Exception:
            # Не валим страницу из-за одного плохого ответа.
            pass

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--disable-blink-features=AutomationControlled",
                ],
            )
            try:
                context = await browser.new_context(
                    user_agent=_UA,
                    locale="ru-RU",
                    viewport={"width": 1280, "height": 800},
                    extra_http_headers={
                        "Referer": "https://2gis.ru/",
                        **_SEC_CH_UA_HEADERS,
                    },
                )
                page = await context.new_page()
                page.on("response", _on_response)

                try:
                    await page.goto(url, wait_until="domcontentloaded", timeout=_PAGE_TIMEOUT_MS)
                except PlaywrightTimeout:
                    result.error = "navigation timeout"
                    return result

                # Защита: если 2GIS всё-таки перенаправил на /museum (например,
                # обновил детект headless), пробуем кликнуть «Пропустить
                # обновление браузера и перейти в 2ГИС».
                if "/museum" in page.url:
                    for sel in (
                        'a:has-text("Пропустить обновление")',
                        'a:has-text("перейти в 2ГИС")',
                        f'a[href*="firm/{external_id}"]',
                    ):
                        try:
                            el = await page.query_selector(sel)
                            if el:
                                await el.click(timeout=3_000)
                                await page.wait_for_load_state(
                                    "domcontentloaded", timeout=_PAGE_TIMEOUT_MS,
                                )
                                break
                        except Exception:
                            continue

                # Ждём пока сеть утихнет (большинство XHR долетят к этому моменту).
                # 2GIS грузит ~90 чанков, поэтому даём больше времени.
                try:
                    await page.wait_for_load_state("networkidle", timeout=_NETWORK_IDLE_TIMEOUT_MS)
                except PlaywrightTimeout:
                    # Не критично — продолжаем с тем что успели поймать.
                    pass

                # Доп. пауза — на проде увидели что innerText заполняется после
                # того как все основные XHR долетели; networkidle одного раза
                # бывает мало.
                try:
                    await page.wait_for_timeout(_POST_RENDER_WAIT_MS)
                except Exception:
                    pass

                # Часть телефонов 2GIS прячет за кнопкой «Показать телефон» —
                # пробуем кликнуть. Селектор пытается покрыть несколько вариантов
                # верстки (текстовый узел / aria-label / data-attribute).
                for selector in (
                    'button:has-text("Показать телефон")',
                    'button:has-text("Показать номер")',
                    '[aria-label*="Показать телефон"]',
                    'a:has-text("Показать телефон")',
                ):
                    try:
                        await page.click(selector, timeout=_SHOW_PHONE_TIMEOUT_MS)
                        # Подождём чтобы XHR за расшифровкой телефона долетел
                        await page.wait_for_timeout(500)
                        break
                    except Exception:
                        continue

                # Снимаем rendered text — после JS-рендера тут уже видны
                # реальные номера, ссылки на мессенджеры, email-ы.
                try:
                    body_text = await page.evaluate("document.body && document.body.innerText || ''")
                except Exception:
                    body_text = ""
                try:
                    html = await page.content()
                except Exception:
                    html = ""

                final_url = page.url
            finally:
                try:
                    await browser.close()
                except Exception:
                    pass
    except asyncio.CancelledError:
        raise
    except Exception as e:
        logger.debug("fetch_and_extract_2gis_firm: playwright failure for %r: %s", external_id, e)
        return ContactEnrichResult(error=f"playwright: {type(e).__name__}: {str(e)[:200]}")

    # Слой 1: разбираем перехваченные XHR JSON-ответы — самый чистый источник.
    for blob in captured_jsons:
        try:
            _walk_json_for_contacts(blob, result)
        except RecursionError:
            logger.warning("2gis XHR JSON walk hit RecursionError for %s", external_id)

    # Слой 2: regex по innerText после рендера. Покрывает соцсети из футера,
    # «вшитые» номера, fallback если XHR прошёл мимо.
    if body_text:
        text_result = _extract_from_html(body_text)
        result.merge(text_result)

    # Слой 3: regex по rendered HTML (для атрибутов href="tel:..." которые в
    # innerText не попадают, и для ссылок которые JS отрендерил как `<a>`).
    if html:
        html_result = _extract_from_html(html)
        result.merge(html_result)

    # Слой 4: website из HTML через 2GIS-трекер link.2gis.ru/?url=<encoded>
    # (старый формат query-обёртки — fallback для старых страниц).
    if not result.website and html:
        m = _WEBSITE_2GIS_LINK_RE.search(html)
        if m:
            try:
                raw = unquote(m.group(1))
            except Exception:
                raw = m.group(1)
            normalized = _normalize_2gis_url(raw)
            if normalized:
                result.website = normalized

    # Слой 5 ОТКЛЮЧЁН: проверка на проде показала что 2GIS Владимира на
    # ВСЕХ карточках firm рендерит общий рекламный/партнёрский баннер
    # (https://otello.ru/) первым внешним href. Логика "первая non-2gis
    # ссылка = сайт компании" забивает 100% компаний этой рекламой.
    # Нужно искать ссылку рядом с DOM-меткой «Сайт»/«Веб-сайт» или внутри
    # специфичного класса карточки контактов — это TODO следующего раунда.
    # if not result.website and html:
    #     direct = _pick_external_website(html)
    #     if direct:
    #         result.website = direct

    result.fetched_url = final_url if 'final_url' in locals() else url
    return result
