"""Яндекс.Карты — провайдер для поиска компаний и отзывов.

Я.Карты — это SPA на yandex.com/maps (yandex.ru/maps редиректит на .com).
Server-side HTML содержит только метаданные сайта (WebSite, BreadcrumbList),
сами карточки компаний рендерятся client-side через JS. Поэтому `search_companies`
работает через headless-Chromium (Playwright), а не httpx + JSON-LD.

`fetch_reviews` остался на httpx — внутренний AJAX /maps/api/business/fetchReviews
отдаёт чистый JSON и не требует браузера.

Особенности:
- Я.Карты редиректят на yandex.com/maps/213/moscow/search/... — это нормально.
- Прокси обязателен в проде (USE_PROXY=true + PROXY_LIST в Settings).
  Без прокси Я.Карты быстро банят IP (особенно с серверных диапазонов).
- При капче (SmartCaptcha) пробуем solve_yandex_smartcaptcha. Три подряд → CaptchaWallError.

Зависимости:
- playwright (chromium-headless-shell установлен в Docker-образе backend)
- backend/app/modules/searches/providers/common.py — get_proxy_config (для прокси), fetch_with_retry (для reviews)
- backend/app/modules/captcha/solver.py — solve_yandex_smartcaptcha(html, url, db)

Legacy: helper-функции `_extract_companies_from_html`, `_ld_to_company_raw`
оставлены для обратной совместимости с тестами — сам поиск их больше не использует.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, AsyncIterator
from urllib.parse import quote_plus

import httpx
from bs4 import BeautifulSoup
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.captcha.solver import solve_yandex_smartcaptcha
from app.modules.maps.providers.base import (
    CaptchaWallError,
    MapProvider,
    RateLimitError,  # noqa: F401 — оставлен для единообразия импортов
)
from app.modules.maps.schemas import CompanyRaw, ReviewRaw
from app.modules.maps.utils import extract_city_from_address, mask_author
from app.modules.searches.providers.common import (
    detect_blocking,
    fetch_with_retry,
    get_proxy_config,
    get_random_user_agent,
)

logger = logging.getLogger(__name__)


YANDEX_MAPS_URL = "https://yandex.ru/maps/"
YANDEX_MAPS_API_SEARCH = "https://yandex.ru/maps/api/search/"
YANDEX_MAPS_API_REVIEWS = "https://yandex.ru/maps/api/business/fetchReviews"

REVIEWS_PAGE_SIZE = 50

# Максимум капч подряд, после которых сдаёмся. Из ТЗ §3.3.
MAX_CAPTCHA_ATTEMPTS = 3

# UA Chrome 148 — соответствует реальной версии chromium-headless-shell в Docker.
# С дефолтным UA HeadlessChrome Я.Карты быстрее показывают капчу.
_PLAYWRIGHT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
)
_PLAYWRIGHT_HEADERS = {
    "Accept-Language": "ru-RU,ru;q=0.9",
    "Sec-Ch-Ua": '"Chromium";v="148", "Not.A/Brand";v="24", "Google Chrome";v="148"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
}

_PAGE_TIMEOUT_MS = 30_000        # навигация
_LIST_TIMEOUT_MS = 15_000        # ждём появления первой карточки
# 2026-07-12: раньше 20 итераций + no_growth=3 давало потолок ~50 компаний
# в узкой нише СПб, хотя Я.Карты по типовым запросам держат до 200-500.
# Юзер жаловался «мало компаний в парсе» — расширяем до 80 итераций,
# no-growth порог 5 (виртуализированный DOM иногда не догоняет за 3 такта).
_SCROLL_MAX_ITERATIONS = 80
_SCROLL_STEP_PX = 1200
_SCROLL_WAIT_MS = 900            # пауза между скроллами для подгрузки
_SCROLL_NO_GROWTH_STOP = 5       # столько итераций подряд без роста → выход


# ID организации Я.Карт — длинная цифра в URL после slug:
# https://yandex.ru/maps/org/some-slug/1234567890123/  →  '1234567890123'
_ORG_ID_RE = re.compile(r"/maps/org/[^/]+/(\d+)")


def extract_org_id_from_url(url: str | None) -> str | None:
    """Вытаскивает businessId из URL карточки организации Я.Карт."""
    if not url:
        return None
    m = _ORG_ID_RE.search(url)
    return m.group(1) if m else None


def _safe_float(value: Any) -> float | None:
    """Конвертирует value в float, или None если не получается."""
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_unix_timestamp(value: Any) -> datetime | None:
    """fetchReviews возвращает `time` как unix-секунды (или миллисекунды для некоторых ответов).
    Эвристика: если число > 10^12 — это миллисекунды."""
    if value is None:
        return None
    try:
        ts = float(value)
    except (TypeError, ValueError):
        return None
    if ts > 1e12:  # ms
        ts = ts / 1000.0
    try:
        return datetime.fromtimestamp(ts, tz=timezone.utc)
    except (OverflowError, OSError, ValueError):
        return None


def _ld_to_company_raw(ld: dict[str, Any]) -> CompanyRaw | None:
    """Маппинг JSON-LD blob → CompanyRaw. Возвращает None если базовых полей не хватает."""
    name = ld.get("name")
    raw_id = ld.get("@id") or ld.get("url")
    external_id = extract_org_id_from_url(raw_id)
    if not name or not external_id:
        return None

    address_obj = ld.get("address") or {}
    geo = ld.get("geo") or {}
    aggregate = ld.get("aggregateRating") or {}

    address = None
    if isinstance(address_obj, dict):
        address = address_obj.get("streetAddress") or address_obj.get("addressLocality")
    elif isinstance(address_obj, str):
        address = address_obj

    return CompanyRaw(
        source="yandex_maps",
        external_id=external_id,
        name=str(name),
        address=address,
        lat=_safe_float(geo.get("latitude")) if isinstance(geo, dict) else None,
        lng=_safe_float(geo.get("longitude")) if isinstance(geo, dict) else None,
        phone=ld.get("telephone") if isinstance(ld.get("telephone"), str) else None,
        website=ld.get("url") if isinstance(ld.get("url"), str) and "/maps/org/" not in (ld.get("url") or "") else None,
        rating=_safe_float(aggregate.get("ratingValue")) if isinstance(aggregate, dict) else None,
        reviews_count=(_safe_int(aggregate.get("reviewCount")) if isinstance(aggregate, dict) else None) or 0,
        raw_data=ld,
    )


def _playwright_proxy_from_url(proxy_url: str | None) -> dict[str, str] | None:
    """Конвертирует строку прокси (http://user:pass@host:port) в формат Playwright.

    Playwright принимает proxy={"server": "...", "username": "...", "password": "..."}.
    """
    if not proxy_url:
        return None
    from urllib.parse import urlparse
    p = urlparse(proxy_url)
    if not p.hostname or not p.port:
        return None
    scheme = p.scheme or "http"
    out: dict[str, str] = {"server": f"{scheme}://{p.hostname}:{p.port}"}
    if p.username:
        out["username"] = p.username
    if p.password:
        out["password"] = p.password
    return out


def _parse_search_cards_from_html(html: str) -> list[CompanyRaw]:
    """Парсит выдачу Я.Карт из отрендеренного HTML.

    Ожидает контейнеры `.search-business-snippet-view`. Из каждой карточки тянет:
      - name из `.search-business-snippet-view__title`
      - external_id из любой ссылки `/maps/org/<slug>/<id>` внутри карточки
      - rating из `.business-rating-badge-view__rating-text` (формат "4,8")
      - reviews_count из `.business-rating-with-text-view__count [aria-hidden="true"]`
        (формат "(868)")
      - address из `.search-business-snippet-view__address`

    Phone/website на странице выдачи Я.Карт не отдают — за ними нужна отдельная
    карточка `/maps/org/<id>/`. Сейчас не делаем — оставлено на enrich-таск.
    """
    soup = BeautifulSoup(html, "html.parser")
    out: list[CompanyRaw] = []
    seen_ids: set[str] = set()
    for card in soup.select(".search-business-snippet-view"):
        title_el = card.select_one(".search-business-snippet-view__title")
        if not title_el:
            continue
        # Имя — берём прямой текст, отбрасывая дочерние span'ы (verified badge и т.п.)
        name_parts = [s for s in title_el.find_all(text=True, recursive=False)]
        name = " ".join(p.strip() for p in name_parts if p.strip())
        if not name:
            name = title_el.get_text(strip=True)
        if not name:
            continue

        external_id: str | None = None
        for a in card.select('a[href*="/maps/org/"]'):
            href = a.get("href") or ""
            extracted = extract_org_id_from_url(href)
            if extracted:
                external_id = extracted
                break
        if not external_id or external_id in seen_ids:
            continue
        seen_ids.add(external_id)

        rating: float | None = None
        rating_el = card.select_one(".business-rating-badge-view__rating-text")
        if rating_el:
            rating = _safe_float(rating_el.get_text(strip=True).replace(",", "."))

        reviews_count = 0
        count_el = card.select_one('.business-rating-with-text-view__count [aria-hidden="true"]')
        if count_el:
            txt = count_el.get_text(strip=True).strip("()").replace("\xa0", "").replace(" ", "")
            parsed = _safe_int(txt)
            if parsed is not None:
                reviews_count = parsed

        address: str | None = None
        addr_el = card.select_one(".search-business-snippet-view__address")
        if addr_el:
            address = addr_el.get_text(" ", strip=True) or None

        out.append(
            CompanyRaw(
                source="yandex_maps",
                external_id=external_id,
                name=name,
                address=address,
                rating=rating,
                reviews_count=reviews_count,
            )
        )
    return out


def _extract_companies_from_html(html: str) -> list[CompanyRaw]:
    """Парсит HTML главной выдачи Я.Карт, собирает CompanyRaw из всех JSON-LD блоков.

    Поддерживает три формы:
    1. <script type="application/ld+json">{"@type": "LocalBusiness", ...}</script> — одна организация
    2. <script type="application/ld+json">{"@type": "ItemList", "itemListElement": [...]}</script>
    3. <script type="application/ld+json">[{...}, {...}]</script>
    """
    soup = BeautifulSoup(html, "html.parser")
    companies: list[CompanyRaw] = []
    for tag in soup.find_all("script", type="application/ld+json"):
        text = (tag.string or "").strip() or tag.get_text(strip=True)
        if not text:
            continue
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            continue

        items: list[dict[str, Any]] = []
        if isinstance(data, list):
            items = [x for x in data if isinstance(x, dict)]
        elif isinstance(data, dict):
            if data.get("@type") in ("ItemList", "CollectionPage"):
                for el in data.get("itemListElement") or []:
                    if isinstance(el, dict):
                        item = el.get("item") if isinstance(el.get("item"), dict) else el
                        if isinstance(item, dict):
                            items.append(item)
            else:
                items = [data]

        for it in items:
            company = _ld_to_company_raw(it)
            if company is not None:
                companies.append(company)
    return companies


class YandexMapsProvider(MapProvider):
    """Async-провайдер Я.Карт.

    db: AsyncSession нужна для вызова solve_yandex_smartcaptcha (читает конфиг 2captcha из БД).
    Если db не передана и упёрлись в капчу — сразу CaptchaWallError, без попытки solver.
    """

    source_name = "yandex_maps"

    def __init__(self, db: AsyncSession | None = None, use_proxy: bool | None = None):
        self._db = db
        # use_proxy=None → берём из settings.USE_PROXY. True/False — явный override.
        # Читаем конфиг из БД через sync-хелпер (singleton-строка MapProviderConfig).
        # Yandex работает через HTML-парсинг с прокси, без API-ключа — поэтому
        # ключи тут не используются, но вызов нужен чтобы провайдер «знал» о
        # настройках в БД (для логики skip при is_enabled=False в service-слое).
        from app.modules.maps.providers_settings_service import load_provider_keys

        self._provider_keys = load_provider_keys("yandex_maps")
        self._use_proxy = settings.USE_PROXY if use_proxy is None else use_proxy

    async def _solve_captcha_or_raise(
        self,
        html: str,
        page_url: str,
        attempts_so_far: int,
    ) -> str | None:
        """Пробует решить капчу. Возвращает токен (для подстановки в cookies/params),
        либо None если solver недоступен или не справился.
        Бросает CaptchaWallError если attempts_so_far >= MAX_CAPTCHA_ATTEMPTS."""
        if attempts_so_far >= MAX_CAPTCHA_ATTEMPTS:
            raise CaptchaWallError(
                f"Yandex Maps: {MAX_CAPTCHA_ATTEMPTS} капч подряд, отступаем"
            )
        if self._db is None:
            logger.warning("yandex_maps: капча, но db не передана — solver вызвать не можем")
            return None
        try:
            token = await solve_yandex_smartcaptcha(html, page_url, self._db)
        except Exception as e:
            logger.warning("yandex_maps: solver упал: %s", e)
            return None
        if not token:
            logger.warning("yandex_maps: solver вернул None (не настроен 2captcha?)")
        return token

    async def search_companies(
        self,
        niche: str,
        city: str,
        limit: int = 100,
        *,
        point: tuple[float, float] | None = None,
        radius_meters: int | None = None,
    ) -> AsyncIterator[CompanyRaw]:
        """Поиск компаний через headless-Chromium (Playwright).

        Я.Карты — SPA, выдача рендерится JS-ом, в server-side HTML её нет.
        Открываем страницу в реальном браузере, скроллим список до набора `limit`
        компаний (или потолка скроллов), парсим карточки `.search-business-snippet-view`.

        Radius-режим (point + radius_meters) пока не поддерживается — игнорируется.
        """
        _ = point, radius_meters
        query = f"{niche} {city}".strip()
        url = f"{YANDEX_MAPS_URL}?text={quote_plus(query)}"

        proxy_url = get_proxy_config() if self._use_proxy else None
        proxy_arg = _playwright_proxy_from_url(proxy_url)

        from playwright.async_api import async_playwright, TimeoutError as PWTimeout

        collected: dict[str, CompanyRaw] = {}
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
                        user_agent=_PLAYWRIGHT_UA,
                        locale="ru-RU",
                        viewport={"width": 1366, "height": 900},
                        extra_http_headers=_PLAYWRIGHT_HEADERS,
                    )
                    page = await ctx.new_page()
                    try:
                        await page.goto(url, wait_until="domcontentloaded", timeout=_PAGE_TIMEOUT_MS)
                    except PWTimeout:
                        logger.warning(
                            "yandex_maps: page.goto timeout url=%s proxy=%s",
                            url, bool(proxy_arg),
                        )
                        return

                    # Если редирект на /showcaptcha — это капча. SmartCaptcha solver работает
                    # с HTML (через data-sitekey), нам нужен HTML страницы капчи.
                    if "/showcaptcha" in page.url.lower() or "/checkcaptcha" in page.url.lower():
                        logger.warning(
                            "yandex_maps: captcha redirect landed=%s query=%r proxy=%s",
                            page.url, query, bool(proxy_arg),
                        )
                        captcha_html = await page.content()
                        await self._solve_captcha_or_raise(captcha_html, page.url, 1)
                        # token получили, но в Playwright его не применить простым cookie —
                        # это требует отдельной формы submit. Пока — отступаем.
                        raise CaptchaWallError("Yandex Maps: капча, solver-flow в Playwright не реализован")

                    try:
                        await page.wait_for_selector(".search-business-snippet-view", timeout=_LIST_TIMEOUT_MS)
                    except PWTimeout:
                        # Карточек не появилось — либо пустая выдача, либо капча, либо изменилась вёрстка.
                        # 2026-07-14: подробное логирование, чтобы отличить причины в проде
                        # (за сутки yandex может изменить класс карточки — тогда селектор просто
                        # не появится, а мы молча возвращали 0 без сигнала).
                        html_check = await page.content()
                        low = html_check.lower()
                        if any(k in low for k in ("showcaptcha", "smartcaptcha", "checkcaptcha")):
                            logger.warning(
                                "yandex_maps: SmartCaptcha wall on results page url=%s query=%r",
                                page.url, query,
                            )
                            raise CaptchaWallError("Yandex Maps: SmartCaptcha на странице выдачи")
                        # Собираем диагностику: URL, длина HTML, наличие типовых классов.
                        markers = {
                            "search_business_snippet_view": ".search-business-snippet-view" in html_check,
                            "search_list_view": "search-list-view" in low,
                            "business_segments_list_view": "business-segments-list-view" in low,
                            "nothing_found": ("ничего не найдено" in low) or ("nothing found" in low),
                            "generic_maps_home": "search-form-view__input" in html_check and ".search-business-snippet-view" not in html_check,
                        }
                        logger.warning(
                            "yandex_maps: selector .search-business-snippet-view не появился за %dмс. "
                            "url=%s final_url=%s query=%r html_len=%d markers=%s html_head=%r",
                            _LIST_TIMEOUT_MS, url, page.url, query, len(html_check), markers,
                            html_check[:400],
                        )
                        return

                    # Я.Карты используют ВИРТУАЛИЗИРОВАННЫЙ скролл: в DOM лежат только видимые
                    # карточки. Поэтому накапливаем инкрементально — парсим текущий HTML
                    # после каждого скролла, дедуплицируем по external_id, и так до потолка.
                    no_growth_iters = 0
                    for _ in range(_SCROLL_MAX_ITERATIONS):
                        page_html = await page.content()
                        for company in _parse_search_cards_from_html(page_html):
                            if company.external_id and company.external_id not in collected:
                                collected[company.external_id] = company
                        if len(collected) >= limit:
                            break

                        prev = len(collected)
                        # Скроллим именно сайдбар выдачи, не window. Селектор контейнера
                        # выдачи менялся за релизы — пробуем несколько fallback'ов.
                        await page.evaluate(
                            f"""() => {{
                                const candidates = [
                                    '.scroll__container',
                                    '.search-list-view__list',
                                    '[class*="search-list-view"]',
                                    '.business-segments-list-view',
                                ];
                                for (const sel of candidates) {{
                                    const el = document.querySelector(sel);
                                    if (el && el.scrollHeight > el.clientHeight + 10) {{
                                        el.scrollBy(0, {_SCROLL_STEP_PX});
                                        return sel;
                                    }}
                                }}
                                window.scrollBy(0, {_SCROLL_STEP_PX});
                                return 'window';
                            }}"""
                        )
                        await page.wait_for_timeout(_SCROLL_WAIT_MS)
                        if len(collected) == prev:
                            no_growth_iters += 1
                            if no_growth_iters >= _SCROLL_NO_GROWTH_STOP:
                                # Потолок: Я.Карты больше карточек не отдают.
                                # (либо реально всё, либо capped серверной стороной).
                                logger.info(
                                    "yandex_maps: no growth for %d iters, stop at %d companies",
                                    _SCROLL_NO_GROWTH_STOP, len(collected),
                                )
                                break
                        else:
                            no_growth_iters = 0
                    logger.info(
                        "yandex_maps: search '%s %s' — собрано %d компаний за %d скроллов",
                        niche, city, len(collected), _ + 1,
                    )
                finally:
                    await browser.close()
        except CaptchaWallError:
            raise
        except Exception as e:
            # 2026-07-14: логируем тип exception + сообщение — раньше терялся
            # трейс, было непонятно ImportError (playwright/chromium missing),
            # ProxyError (dead proxy) или что-то иное.
            logger.warning(
                "yandex_maps: Playwright error type=%s msg=%s query=%r use_proxy=%s",
                type(e).__name__, e, f"{niche} {city}", self._use_proxy,
                exc_info=True,
            )
            return

        yielded = 0
        for company in collected.values():
            if yielded >= limit:
                return
            company.niche = niche
            # Yandex HTML отдаёт address строкой без структурированного adm_div
            # (как у 2GIS). Если в строке адреса виден другой известный город —
            # значит компания из соседнего НП, и сохранять её под `city` запроса
            # = утечка. extract_city_from_address возвращает фактический город.
            company.city = extract_city_from_address(company.address, city)
            yield company
            yielded += 1

    async def _search_via_api(
        self,
        query: str,
        niche: str,
        city: str,
        limit: int,
    ) -> AsyncIterator[CompanyRaw]:
        """Fallback: внутренний JSON-API /maps/api/search/?text=...&type=business.
        Структура нестабильная, может вернуть HTML с капчей вместо JSON."""
        api_url = f"{YANDEX_MAPS_API_SEARCH}?text={quote_plus(query)}&type=business&lang=ru&results={limit}"
        response = await fetch_with_retry(api_url, referer=YANDEX_MAPS_URL, use_proxy=self._use_proxy)
        if response is None:
            return

        # Может оказаться HTML с капчей вместо JSON.
        ctype = (response.headers.get("content-type") or "").lower()
        if "json" not in ctype:
            logger.warning("yandex_maps API: ожидали JSON, получили %s", ctype)
            return

        try:
            data = response.json()
        except (ValueError, json.JSONDecodeError):
            return

        items = (data.get("items") or data.get("data") or {}).get("items") or []
        if not isinstance(items, list):
            return

        yielded = 0
        for item in items:
            if yielded >= limit:
                break
            if not isinstance(item, dict):
                continue
            external_id = (
                extract_org_id_from_url(item.get("url"))
                or str(item.get("id") or "").strip()
                or None
            )
            name = item.get("title") or item.get("name")
            if not external_id or not name:
                continue
            coords = item.get("coordinates") or {}
            raw_address = item.get("address") if isinstance(item.get("address"), str) else None
            yield CompanyRaw(
                source="yandex_maps",
                external_id=str(external_id),
                name=str(name),
                niche=niche,
                city=extract_city_from_address(raw_address, city),
                address=raw_address,
                lat=_safe_float(coords.get("lat")) if isinstance(coords, dict) else None,
                lng=_safe_float(coords.get("lon")) if isinstance(coords, dict) else None,
                phone=item.get("phone") if isinstance(item.get("phone"), str) else None,
                website=item.get("website") if isinstance(item.get("website"), str) else None,
                rating=_safe_float(item.get("rating")),
                reviews_count=_safe_int(item.get("reviews_count")) or 0,
                raw_data=item,
            )
            yielded += 1

    async def fetch_reviews(
        self,
        company_external_id: str,
        limit: int = 100,
    ) -> AsyncIterator[ReviewRaw]:
        """Стримит отзывы парсингом SSR HTML /maps/org/{id}/reviews/.

        Раньше использовался AJAX /maps/api/business/fetchReviews — он отдавал
        чистый JSON. С 2026-06 этот endpoint требует CSRF и при любом обычном
        вызове возвращает только {"csrfToken": "..."} (67 байт), а отзывы не
        отдаёт даже с токеном (400 Bad Request или повторно токен — Yandex
        блокирует сторонних потребителей).

        Решение: HTML-страница /maps/org/{businessId}/reviews/ инлайнит
        первые ~50 отзывов прямо в HTML с полной Schema.org разметкой
        (`<div itemprop="review" itemtype=".../Review">`). Парсим её через
        BeautifulSoup. Для большинства компаний из MVP-сценариев (стоматологии,
        фитнес, общепит) 50 свежих отзывов более чем достаточно для
        sentiment/pain-tag анализа.

        Pagination через bare AJAX не сделать — для глубокой выгрузки нужен
        будет Playwright (см. enrich_yandex.py). Пока не критично.
        """
        url = f"https://yandex.ru/maps/org/{company_external_id}/reviews/"
        headers = {
            "User-Agent": get_random_user_agent(),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ru-RU,ru;q=0.9",
        }
        proxy = get_proxy_config() if self._use_proxy else None
        try:
            async with httpx.AsyncClient(
                timeout=20.0, headers=headers, proxy=proxy, follow_redirects=True
            ) as client:
                response = await client.get(url)
        except httpx.HTTPError as e:
            logger.warning("yandex_maps reviews HTML error: %s", e)
            return

        if response.status_code != 200:
            logger.warning(
                "yandex_maps reviews HTML: status=%d for business=%s",
                response.status_code, company_external_id,
            )
            return

        soup = BeautifulSoup(response.text, "html.parser")
        review_nodes = soup.select('div.business-review-view[itemprop="review"]')
        if not review_nodes:
            logger.info(
                "yandex_maps reviews HTML: no review nodes for business=%s (len=%d)",
                company_external_id, len(response.content),
            )
            return

        yielded = 0
        for node in review_nodes:
            if yielded >= limit:
                return
            review = _parse_review_node(node, company_external_id)
            if review is not None:
                yield review
                yielded += 1


def _parse_review_node(node: Any, business_id: str) -> ReviewRaw | None:
    """BeautifulSoup-Tag отзыва → ReviewRaw. None если данных совсем нет."""
    # rating: <meta itemprop="ratingValue" content="5.0"/>
    rating_meta = node.select_one('meta[itemprop="ratingValue"]')
    rating: int | None = None
    if rating_meta and rating_meta.get("content"):
        try:
            rating = int(round(float(rating_meta["content"])))
        except (ValueError, TypeError):
            rating = None

    # date: <meta itemprop="datePublished" content="2026-01-24T06:57:24.400Z"/>
    date_meta = node.select_one('meta[itemprop="datePublished"]')
    posted_at: datetime | None = None
    if date_meta and date_meta.get("content"):
        raw = str(date_meta["content"]).strip()
        try:
            # ISO-8601 с Z (UTC). datetime.fromisoformat в py3.11 принимает Z.
            posted_at = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            posted_at = None

    # author name: <span itemprop="name">Имя Фамилия</span>
    name_node = node.select_one('[itemprop="author"] [itemprop="name"]')
    raw_name = name_node.get_text(strip=True) if name_node else None
    author_masked = mask_author(raw_name) if raw_name else None

    # body: <span itemprop="reviewBody"> ИЛИ .business-review-view__body
    body_node = node.select_one('[itemprop="reviewBody"]') or node.select_one(
        ".business-review-view__body"
    )
    raw_text = body_node.get_text(separator="\n", strip=True) if body_node else None

    # owner reply: блок .business-review-view__date._org-answer присутствует,
    # когда владелец ответил.
    has_owner_reply = node.select_one(".business-review-view__date._org-answer") is not None

    # source_url: ссылка на сам отзыв на Я.Картах.
    # Стабильного якоря на отдельный отзыв в DOM нет — даём ссылку на reviews-блок компании.
    source_url = f"https://yandex.ru/maps/org/{business_id}/reviews/"

    # Уникальный id отзыва в HTML не выставлен. Используем хэш content+author
    # как deterministic-id; в save_reviews_batch есть собственный dedup по
    # raw_text+author, так что external_id=None не критичен.
    return ReviewRaw(
        source="yandex_maps",
        external_id=None,
        author_masked=author_masked,
        rating=rating,
        raw_text=raw_text,
        source_url=source_url,
        posted_at=posted_at,
        has_owner_reply=has_owner_reply,
    )
