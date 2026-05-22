"""2GIS Catalog API provider.

Документация: https://docs.2gis.com/ru/api/search/places/overview
Лимит free-тарифа: 1000 запросов в сутки на ключ. Превышение → 429.

Ключевые особенности:
- город → region_id через словарь CITY_TO_REGION_ID. Города вне списка → region_id=70000001
  (вся Россия) с последующей фильтрацией по адресу на уровне БД.
- Прокси НЕ используем — Catalog API стабильно работает с прямым IP.
- Rate limit: settings.TWOGIS_RATE_LIMIT_DELAY (default 1.1s) между запросами.
- 401/403 → MissingAPIKeyError. 429 → backoff 30s × 3 ретрая. 5xx → backoff 5s × 3 ретрая.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, AsyncIterator
from urllib.parse import urlencode

import httpx

from app.core.config import settings
from app.modules.maps.providers.base import (
    CaptchaWallError,  # noqa: F401 — для единообразия импортов, тут не используется
    MapProvider,
    MissingAPIKeyError,
    RateLimitError,
)
from app.modules.maps.schemas import CompanyRaw, ReviewRaw
from app.modules.maps.utils import mask_author

logger = logging.getLogger(__name__)


# Регион-ID 2GIS для основных городов РФ. Источник — справочник 2GIS.
# При расширении списка проверяйте через `GET /3.0/region/list?q={город}&key=...`.
CITY_TO_REGION_ID: dict[str, int] = {
    "москва": 1,
    "санкт-петербург": 2,
    "новосибирск": 12,
    "екатеринбург": 54,
    "казань": 21,
    "нижний новгород": 18,
    "челябинск": 56,
    "красноярск": 14,
    "самара": 33,
    "уфа": 41,
    "ростов-на-дону": 38,
    "омск": 66,
    "краснодар": 23,
    "воронеж": 64,
    "пермь": 31,
    "волгоград": 39,
    "ижевск": 44,
    "иркутск": 13,
    "тюмень": 45,
    "хабаровск": 28,
    "владивосток": 4,
    "томск": 15,
    "оренбург": 35,
    "кемерово": 53,
    "рязань": 50,
    "тула": 49,
    "пенза": 36,
    "липецк": 32,
}

# Регион-ID 70000001 = "Россия" (универсальный fallback).
TWOGIS_FALLBACK_REGION_ID = 70000001

BASE_URL_3 = "https://catalog.api.2gis.com/3.0"
BASE_URL_2 = "https://catalog.api.2gis.com/2.0"

PAGE_SIZE = 50  # максимум для 3.0/items
REVIEWS_PAGE_SIZE = 50


def resolve_region_id(city: str) -> int:
    """Вернёт region_id по названию города или TWOGIS_FALLBACK_REGION_ID."""
    key = (city or "").strip().lower()
    return CITY_TO_REGION_ID.get(key, TWOGIS_FALLBACK_REGION_ID)


def _extract_phone(item: dict[str, Any]) -> str | None:
    """Достаёт первый телефон из contact_groups (2GIS schema)."""
    for group in item.get("contact_groups") or []:
        for contact in group.get("contacts") or []:
            if (contact.get("type") or "").lower() == "phone":
                value = contact.get("value")
                if value:
                    return str(value)
    return None


def _extract_website(item: dict[str, Any]) -> str | None:
    """Достаёт первый сайт из contact_groups."""
    for group in item.get("contact_groups") or []:
        for contact in group.get("contacts") or []:
            ctype = (contact.get("type") or "").lower()
            if ctype in ("website", "url"):
                value = contact.get("value")
                if value:
                    return str(value)
    return None


def _parse_iso_or_none(s: str | None) -> datetime | None:
    """Парсит ISO-дату 2GIS (например, '2024-09-15T12:30:00+03:00') в datetime с tz."""
    if not s:
        return None
    try:
        # 2GIS отдаёт ISO с tz; fromisoformat в Python 3.11 справляется.
        return datetime.fromisoformat(s)
    except (ValueError, TypeError):
        return None


def _map_item_to_company_raw(item: dict[str, Any]) -> CompanyRaw | None:
    """Маппинг ответа 2GIS items → CompanyRaw. None если базовых полей нет."""
    item_id = item.get("id")
    name = item.get("name")
    if not item_id or not name:
        return None

    point = item.get("point") or {}
    reviews = item.get("reviews") or {}

    return CompanyRaw(
        source="2gis",
        external_id=str(item_id),
        name=str(name),
        address=(item.get("address_name") or item.get("full_address_name") or None),
        lat=float(point["lat"]) if point.get("lat") is not None else None,
        lng=float(point["lon"]) if point.get("lon") is not None else None,
        phone=_extract_phone(item),
        website=_extract_website(item),
        rating=(float(reviews["general_rating"]) if reviews.get("general_rating") is not None else None),
        reviews_count=int(reviews.get("general_review_count") or 0),
        raw_data=item,
    )


def _map_review_to_review_raw(item: dict[str, Any]) -> ReviewRaw | None:
    """Маппинг ответа 2GIS reviews/list → ReviewRaw."""
    raw_text = item.get("text")
    rating = item.get("rating")
    if raw_text is None and rating is None:
        # вырожденный случай — отзыв без текста и без рейтинга, пропускаем
        return None

    user = item.get("user") or {}
    return ReviewRaw(
        source="2gis",
        external_id=str(item["id"]) if item.get("id") is not None else None,
        author_masked=mask_author(user.get("name")),
        rating=int(rating) if rating is not None else None,
        raw_text=raw_text,
        source_url=item.get("url"),
        posted_at=_parse_iso_or_none(item.get("date_created")),
        has_owner_reply=bool(item.get("is_reply_by_owner")),
    )


class TwoGisProvider(MapProvider):
    """Async-провайдер 2GIS Catalog API."""

    source_name = "2gis"

    def __init__(self, api_key: str | None = None, rate_limit_delay: float | None = None):
        """api_key/rate_limit_delay явные параметры удобны для тестов; в проде берётся из settings."""
        self._api_key = api_key if api_key is not None else settings.TWOGIS_API_KEY
        self._delay = rate_limit_delay if rate_limit_delay is not None else settings.TWOGIS_RATE_LIMIT_DELAY
        if not self._api_key:
            raise MissingAPIKeyError(
                "TWOGIS_API_KEY не задан в Settings/env. Получить ключ: https://dev.2gis.com"
            )

    async def _request(self, client: httpx.AsyncClient, url: str, params: dict[str, Any]) -> dict[str, Any]:
        """Один запрос с retry-логикой:
        - 401/403 → MissingAPIKeyError (ключ битый или отозван)
        - 429 → backoff 30s, до 3 ретраев → RateLimitError
        - 5xx → backoff 5s, до 3 ретраев → последний raise
        - 2xx → возвращаем json
        """
        last_exc: Exception | None = None
        for attempt in range(3):
            try:
                resp = await client.get(url, params=params)
            except httpx.HTTPError as e:
                last_exc = e
                logger.warning("2gis %s: network error %s (attempt %d)", url, e, attempt + 1)
                await asyncio.sleep(5)
                continue

            status = resp.status_code
            if status in (401, 403):
                raise MissingAPIKeyError(f"2GIS ответил {status} на {url} — ключ невалиден/отозван")
            if status == 429:
                logger.warning("2gis %s: 429 rate-limited (attempt %d), backoff 30s", url, attempt + 1)
                await asyncio.sleep(30)
                continue
            if status >= 500:
                logger.warning("2gis %s: %d server error (attempt %d), backoff 5s", url, status, attempt + 1)
                await asyncio.sleep(5)
                continue
            resp.raise_for_status()
            return resp.json()

        if last_exc:
            raise last_exc
        raise RateLimitError(f"2GIS rate limit/server error не отпустил после 3 ретраев: {url}")

    async def search_companies(
        self,
        niche: str,
        city: str,
        limit: int = 100,
    ) -> AsyncIterator[CompanyRaw]:
        """Стримит компании по нише в городе. Пагинация по page=1..N до limit."""
        region_id = resolve_region_id(city)
        url = f"{BASE_URL_3}/items"
        common = {
            "q": niche,
            "region_id": region_id,
            "key": self._api_key,
            "fields": "items.point,items.contact_groups,items.reviews,items.rubrics,items.full_address_name",
            "page_size": PAGE_SIZE,
        }

        yielded = 0
        page = 1
        async with httpx.AsyncClient(timeout=15.0) as client:
            while yielded < limit:
                params = {**common, "page": page}
                logger.info(
                    "2gis search: niche=%r city=%r region_id=%d page=%d yielded=%d",
                    niche, city, region_id, page, yielded,
                )
                data = await self._request(client, url, params)

                # Структура: {"meta": {...}, "result": {"items": [...], "total": N}}
                result = (data.get("result") or {})
                items = result.get("items") or []
                total = int(result.get("total") or 0)
                if not items:
                    break

                for item in items:
                    if yielded >= limit:
                        break
                    company = _map_item_to_company_raw(item)
                    if company is None:
                        continue
                    company.niche = niche
                    company.city = city
                    yield company
                    yielded += 1

                if yielded >= total or len(items) < PAGE_SIZE:
                    break

                page += 1
                await asyncio.sleep(self._delay)

    async def fetch_reviews(
        self,
        company_external_id: str,
        limit: int = 100,
    ) -> AsyncIterator[ReviewRaw]:
        """Стримит отзывы компании. Пагинация по offset."""
        url = f"{BASE_URL_2}/reviews/list"
        common = {
            "object_id": company_external_id,
            "object_type": "branch",
            "key": self._api_key,
            "limit": REVIEWS_PAGE_SIZE,
        }

        yielded = 0
        offset = 0
        async with httpx.AsyncClient(timeout=15.0) as client:
            while yielded < limit:
                params = {**common, "offset": offset}
                logger.debug("2gis reviews: company=%s offset=%d yielded=%d", company_external_id, offset, yielded)
                data = await self._request(client, url, params)

                items = (data.get("result") or {}).get("items") or []
                if not items:
                    break

                for item in items:
                    if yielded >= limit:
                        break
                    review = _map_review_to_review_raw(item)
                    if review is None:
                        continue
                    yield review
                    yielded += 1

                if len(items) < REVIEWS_PAGE_SIZE:
                    break
                offset += REVIEWS_PAGE_SIZE
                await asyncio.sleep(self._delay)
