"""Google Maps — провайдер через SerpAPI.

В РФ прямой Google Places API недоступен без VPN + биллинг через карты.
SerpAPI (serpapi.com) проксирует Google Maps и Google Maps Reviews,
работает из России без VPN, бесплатный tier 100 запросов/мес (для
проверки достаточно), платный — $50/мес за 5 000 запросов.

Endpoints SerpAPI:
- engine=google_maps&q=<niche+city>&type=search → local_results[]
- engine=google_maps_reviews&place_id=<...>     → reviews[]

Документация:
- https://serpapi.com/google-maps-api
- https://serpapi.com/google-maps-reviews-api

ENV: SERPAPI_KEY (см. app/core/config.py).

Если ключ не задан — провайдер не инстанцируется (MissingAPIKeyError),
источник в шапке UI помечен как недоступный.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, AsyncIterator

import httpx

from app.core.config import settings
from app.modules.maps.providers.base import (
    MapProvider,
    MissingAPIKeyError,
    RateLimitError,
)
from app.modules.maps.schemas import CompanyRaw, ReviewRaw
from app.modules.maps.utils import mask_author

logger = logging.getLogger(__name__)


SERPAPI_BASE_URL = "https://serpapi.com/search.json"


class GoogleMapsProvider(MapProvider):
    """Async-провайдер Google Maps через SerpAPI."""

    source_name = "google_maps"

    def __init__(self, api_key: str | None = None, rate_limit_delay: float = 1.0):
        self._api_key = api_key if api_key is not None else (settings.SERPAPI_KEY or "")
        self._delay = rate_limit_delay
        if not self._api_key:
            raise MissingAPIKeyError(
                "SERPAPI_KEY не задан. Получить ключ: https://serpapi.com (бесплатно 100/мес)"
            )

    async def _request(
        self, client: httpx.AsyncClient, params: dict[str, Any]
    ) -> dict[str, Any]:
        """SerpAPI запрос с retry-логикой.

        - 401 → MissingAPIKeyError
        - 429 → backoff 30s, до 3 ретраев → RateLimitError
        - 5xx → backoff 5s, до 3 ретраев → последний raise
        """
        last_exc: Exception | None = None
        for attempt in range(3):
            try:
                resp = await client.get(SERPAPI_BASE_URL, params=params, timeout=30.0)
            except httpx.HTTPError as e:
                last_exc = e
                logger.warning("serpapi: network error %s (attempt %d)", e, attempt + 1)
                await asyncio.sleep(5)
                continue
            status = resp.status_code
            if status == 401:
                raise MissingAPIKeyError(
                    "SerpAPI ответил 401 — ключ невалидный или закончился free tier"
                )
            if status == 429:
                logger.warning("serpapi: 429 rate-limited (attempt %d), backoff 30s", attempt + 1)
                await asyncio.sleep(30)
                continue
            if status >= 500:
                logger.warning("serpapi: %d server error (attempt %d), backoff 5s", status, attempt + 1)
                await asyncio.sleep(5)
                continue
            resp.raise_for_status()
            return resp.json()
        if last_exc is not None:
            raise last_exc
        raise RateLimitError("SerpAPI: исчерпали ретраи на rate-limit/server-error")

    async def search_companies(
        self,
        niche: str,
        city: str,
        limit: int = 100,
        *,
        point: tuple[float, float] | None = None,
        radius_meters: int | None = None,
    ) -> AsyncIterator[CompanyRaw]:
        """Стримит компании из Google Maps через SerpAPI.

        Radius-режим не реализован (Google Maps API не принимает meters,
        а только zoom-level в формате @lat,lng,zoom-z). Если point задан —
        используем geo-параметр ll вместо city.
        """
        query = f"{niche} {city}".strip() if not point else niche
        async with httpx.AsyncClient() as client:
            yielded = 0
            start = 0
            while yielded < limit:
                params: dict[str, Any] = {
                    "engine": "google_maps",
                    "type": "search",
                    "q": query,
                    "api_key": self._api_key,
                    "hl": "ru",
                    "gl": "ru",
                    "google_domain": "google.com",
                }
                if point is not None:
                    # SerpAPI ll формат: @lat,lng,z. z=15 ≈ район 1-2 км.
                    params["ll"] = f"@{point[0]},{point[1]},15z"
                if start > 0:
                    params["start"] = start

                data = await self._request(client, params)
                local_results = data.get("local_results") or []
                if not local_results:
                    break

                for item in local_results:
                    company_raw = self._item_to_company_raw(item, niche)
                    if company_raw is None:
                        continue
                    yield company_raw
                    yielded += 1
                    if yielded >= limit:
                        return

                # SerpAPI пагинация: serpapi_pagination.next или next_page_token
                pagination = data.get("serpapi_pagination") or {}
                if not pagination.get("next"):
                    break
                start += len(local_results)
                await asyncio.sleep(self._delay)

    def _item_to_company_raw(self, item: dict[str, Any], niche: str) -> CompanyRaw | None:
        """Конвертирует SerpAPI local_result в нашу CompanyRaw схему."""
        place_id = item.get("place_id") or item.get("data_id")
        title = item.get("title")
        if not place_id or not title:
            return None
        gps = item.get("gps_coordinates") or {}
        # extract city из address — берём 2-й сегмент после , (как делает 2GIS)
        address = item.get("address") or ""
        city = ""
        if address:
            parts = [p.strip() for p in address.split(",") if p.strip()]
            if len(parts) >= 2:
                city = parts[-2] or parts[0]
            else:
                city = parts[0]

        return CompanyRaw(
            source="google_maps",
            external_id=str(place_id),
            name=title,
            niche=niche,
            city=city or None,
            address=address or None,
            lat=float(gps.get("latitude")) if gps.get("latitude") is not None else None,
            lng=float(gps.get("longitude")) if gps.get("longitude") is not None else None,
            phone=item.get("phone"),
            website=item.get("website"),
            rating=float(item.get("rating")) if item.get("rating") is not None else None,
            reviews_count=int(item.get("reviews") or 0),
            raw_data=item,
        )

    async def fetch_reviews(
        self,
        company_external_id: str,
        limit: int = 100,
    ) -> AsyncIterator[ReviewRaw]:
        """Стримит отзывы через SerpAPI google_maps_reviews."""
        async with httpx.AsyncClient() as client:
            yielded = 0
            next_page_token: str | None = None
            while yielded < limit:
                params: dict[str, Any] = {
                    "engine": "google_maps_reviews",
                    "place_id": company_external_id,
                    "api_key": self._api_key,
                    "hl": "ru",
                }
                if next_page_token:
                    params["next_page_token"] = next_page_token
                data = await self._request(client, params)
                reviews = data.get("reviews") or []
                if not reviews:
                    break
                for r in reviews:
                    review_raw = self._review_to_raw(r, company_external_id)
                    if review_raw is None:
                        continue
                    yield review_raw
                    yielded += 1
                    if yielded >= limit:
                        return

                pagination = data.get("serpapi_pagination") or {}
                next_page_token = pagination.get("next_page_token") or None
                if not next_page_token:
                    break
                await asyncio.sleep(self._delay)

    def _review_to_raw(
        self, item: dict[str, Any], company_external_id: str
    ) -> ReviewRaw | None:
        """Конвертирует SerpAPI review в ReviewRaw."""
        review_id = item.get("review_id") or item.get("link") or item.get("snippet")
        if not review_id:
            return None
        rating = item.get("rating")
        if isinstance(rating, dict):
            rating = rating.get("value")
        try:
            rating_int = int(rating) if rating is not None else None
        except (TypeError, ValueError):
            rating_int = None
        # date чаще приходит в виде «3 weeks ago» — превращать в datetime
        # сложно без LLM; оставим None, посчитается через ai-pipeline.
        # iso_date тоже может прийти, но не гарантировано.
        iso = item.get("iso_date") or item.get("date")
        posted_at: datetime | None = None
        if iso and isinstance(iso, str):
            try:
                posted_at = datetime.fromisoformat(iso.replace("Z", "+00:00"))
            except ValueError:
                posted_at = None

        owner_response = item.get("response") or item.get("owner_response")
        return ReviewRaw(
            source="google_maps",
            external_id=str(review_id),
            author_masked=mask_author(item.get("user", {}).get("name") if isinstance(item.get("user"), dict) else None),
            rating=rating_int,
            raw_text=item.get("snippet") or item.get("description") or "",
            source_url=f"https://www.google.com/maps/reviews/data=!4m6!14m5!1m4!2m3!1s{company_external_id}",
            posted_at=posted_at,
            has_owner_reply=owner_response is not None,
        )
