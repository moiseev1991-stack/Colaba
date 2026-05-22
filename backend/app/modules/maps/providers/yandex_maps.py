"""Яндекс.Карты — провайдер для поиска компаний и отзывов.

В отличие от 2GIS, у Я.Карт нет публичного Catalog API. Парсим:
- HTML главной выдачи /maps/?text=... → JSON-LD блок со списком организаций
- (fallback) JSON-API /maps/api/search/?text=...&type=business
- JSON-API /maps/api/business/fetchReviews?businessId=...

Особенности:
- Часто прилетает капча (Yandex SmartCaptcha) → пробуем solve_yandex_smartcaptcha.
  Три подряд капчи → CaptchaWallError.
- Прокси обязателен в проде (USE_PROXY=true + PROXY_LIST в Settings).
  Без прокси на dev-машине Я.Карты быстро банят IP.
- User-Agent ротация уже встроена в fetch_with_retry.

Зависимости:
- backend/app/modules/searches/providers/common.py — fetch_with_retry, detect_blocking, get_proxy_config
- backend/app/modules/captcha/solver.py — solve_yandex_smartcaptcha(html, url, db)
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
from app.modules.maps.utils import mask_author
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
        reviews_count=_safe_int(aggregate.get("reviewCount")) if isinstance(aggregate, dict) else 0,
        raw_data=ld,
    )


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
    ) -> AsyncIterator[CompanyRaw]:
        """Ищет компании по нише в городе через HTML главной выдачи + JSON-LD."""
        query = f"{niche} {city}".strip()
        url = f"{YANDEX_MAPS_URL}?text={quote_plus(query)}&display-text={quote_plus(niche)}"

        captcha_attempts = 0
        cookies: dict[str, str] = {}

        while True:
            response = await fetch_with_retry(
                url,
                referer="https://yandex.ru/",
                use_proxy=self._use_proxy,
                cookies=cookies or None,
            )
            if response is None:
                logger.warning("yandex_maps: fetch_with_retry вернул None для %s", url)
                return

            html = response.text
            blocking = detect_blocking(response, html_content=html)
            if blocking.get("block_type") == "captcha":
                captcha_attempts += 1
                token = await self._solve_captcha_or_raise(html, url, captcha_attempts)
                if not token:
                    # solver не справился — пробуем ещё один прокси-ретрай через fetch_with_retry
                    if captcha_attempts >= MAX_CAPTCHA_ATTEMPTS:
                        raise CaptchaWallError("Yandex Maps: solver не справился с капчей")
                    continue
                # подставляем токен в cookies; точное имя зависит от формы капчи.
                # SmartCaptcha обычно проверяет smart-token в hidden-поле; для GET-запросов
                # это эквивалент cookie 'smart-token'.
                cookies["smart-token"] = token
                continue

            # Успех — парсим
            yielded = 0
            for company in _extract_companies_from_html(html):
                if yielded >= limit:
                    return
                # niche/city проставляем сами — в JSON-LD их нет
                company.niche = niche
                company.city = city
                yield company
                yielded += 1

            if yielded == 0:
                # JSON-LD пустой — пробуем fallback API
                async for c in self._search_via_api(query, niche, city, limit):
                    yield c
            return

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
            yield CompanyRaw(
                source="yandex_maps",
                external_id=str(external_id),
                name=str(name),
                niche=niche,
                city=city,
                address=item.get("address") if isinstance(item.get("address"), str) else None,
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
        """Стримит отзывы через AJAX /maps/api/business/fetchReviews."""
        offset = 0
        yielded = 0
        headers = {
            "User-Agent": get_random_user_agent(),
            "Accept": "application/json,text/plain,*/*",
            "Accept-Language": "ru-RU,ru;q=0.9",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": "https://yandex.ru/maps/",
        }
        proxies = get_proxy_config() if self._use_proxy else None
        async with httpx.AsyncClient(timeout=15.0, headers=headers, proxies=proxies) as client:
            while yielded < limit:
                params = {
                    "businessId": company_external_id,
                    "offset": offset,
                    "limit": REVIEWS_PAGE_SIZE,
                    "lang": "ru",
                }
                try:
                    response = await client.get(YANDEX_MAPS_API_REVIEWS, params=params)
                except httpx.HTTPError as e:
                    logger.warning("yandex_maps fetchReviews error: %s", e)
                    return

                if response.status_code != 200:
                    logger.warning(
                        "yandex_maps fetchReviews: status=%d for business=%s offset=%d",
                        response.status_code, company_external_id, offset,
                    )
                    return

                ctype = (response.headers.get("content-type") or "").lower()
                if "json" not in ctype:
                    # вернули HTML с капчей вместо JSON
                    return

                try:
                    data = response.json()
                except (ValueError, json.JSONDecodeError):
                    return

                items = data.get("items") or data.get("reviews") or []
                if not isinstance(items, list) or not items:
                    return

                for item in items:
                    if yielded >= limit:
                        return
                    if not isinstance(item, dict):
                        continue
                    author = (item.get("author") or {}) if isinstance(item.get("author"), dict) else {}
                    yield ReviewRaw(
                        source="yandex_maps",
                        external_id=str(item["id"]) if item.get("id") is not None else None,
                        author_masked=mask_author(author.get("name") if isinstance(author, dict) else None),
                        rating=_safe_int(item.get("rating")),
                        raw_text=item.get("text"),
                        source_url=item.get("link") or item.get("url"),
                        posted_at=_parse_unix_timestamp(item.get("time") or item.get("updated_time")),
                        has_owner_reply=bool(item.get("business_reply") or item.get("owner_reply")),
                    )
                    yielded += 1

                if len(items) < REVIEWS_PAGE_SIZE:
                    return
                offset += REVIEWS_PAGE_SIZE
