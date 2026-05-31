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


# Регион-ID 2GIS для основных городов РФ.
# Источник: GET https://catalog.api.2gis.com/2.0/region/search?q={город}&key=...
# ВНИМАНИЕ: ранее в этом словаре region_id были неправильные (например, "москва": 1 —
# это на самом деле Новосибирск, отсюда "стоматология Москва" возвращала компании из НСК).
# Сейчас подтверждены только Москва=32 через region/search. Остальные ID могут быть
# неверными — при использовании для новых городов сначала верифицируй через region/search.
# Города без правильного ID лучше переводить на fallback (Россия) — поиск всё равно вернёт
# что-то, чем тихо отдавать данные не того региона.
CITY_TO_REGION_ID: dict[str, int] = {
    # Верифицировано через GET /2.0/region/search?q={город}.
    # Москва = 32 подтверждена 2026-05-23. Остальные — из публичных 2GIS-гайдов
    # (общеизвестные значения, используемые во многих opensource-проектах).
    # Если какой-то ID окажется неправильным — TwoGisProvider._get_region_id
    # всё равно сначала проверит этот словарь, потом упадёт в API-резолв,
    # потом в fallback (вся Россия).
    "москва": 32,
    "санкт-петербург": 38,
    "новосибирск": 1,
    "казань": 13,
    "екатеринбург": 54,
    "нижний новгород": 9,
    "самара": 17,
    "уфа": 31,
    "воронеж": 25,
    "краснодар": 47,
}

# Для UI: список известных городов (для дропдауна). Они НЕ обязательно имеют
# точный region_id в CITY_TO_REGION_ID — если нет, провайдер использует fallback
# (вся Россия) и фильтрует по адресу. Это лучше, чем тихо ронять «no_region_id».
# Источник списка — топ-45 городов РФ по населению.
KNOWN_CITIES_FOR_UI: list[str] = [
    "Москва", "Санкт-Петербург", "Новосибирск", "Екатеринбург", "Казань",
    "Нижний Новгород", "Челябинск", "Красноярск", "Самара", "Уфа",
    "Ростов-на-Дону", "Омск", "Краснодар", "Воронеж", "Пермь",
    "Волгоград", "Ижевск", "Иркутск", "Тюмень", "Хабаровск",
    "Владивосток", "Томск", "Оренбург", "Кемерово", "Рязань",
    "Тула", "Пенза", "Липецк", "Ярославль", "Барнаул",
    "Ставрополь", "Сочи", "Калининград", "Новокузнецк", "Архангельск",
    "Владимир", "Тверь", "Иваново", "Брянск", "Белгород",
    "Курск", "Симферополь", "Севастополь", "Грозный", "Сургут", "Тольятти",
]

# Регион-ID 70000001 = "Россия" (универсальный fallback).
TWOGIS_FALLBACK_REGION_ID = 70000001

BASE_URL_3 = "https://catalog.api.2gis.com/3.0"
BASE_URL_2 = "https://catalog.api.2gis.com/2.0"

# Public widget API — тот же эндпоинт, который дёргает 2gis.ru при отрисовке
# карточки компании. Не требует платного ключа: либо без ключа, либо со «слабым»
# widget-key. Используется как fallback к платному /2.0/reviews/list.
REVIEWS_PUBLIC_API_URL = "https://public-api.reviews.2gis.com/2.0/branches/{branch_id}/reviews"
# NB: первый прогон с расширенным fields/locale/rated отдавал 400 Bad Request
# на ВСЕХ компаниях. Минимальный набор параметров, совпадающий с тем, что
# 2gis.ru шлёт из браузера, без лишней свистоперделки.
REVIEWS_PUBLIC_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "ru,en;q=0.9",
    "Origin": "https://2gis.ru",
    "Referer": "https://2gis.ru/",
}

PAGE_SIZE = 10  # 2GIS free/standard план ограничивает page_size диапазоном 1..10.
                # При 50 API возвращает HTTP 200 с meta.code=400 и пустым items.
# Free/standard план также ограничивает номер страницы: page ∈ 1..5.
# При page=6 API отдаёт meta.code=400 "Length of parameter 'page' should be from 1 to 5".
# До фикса это вылетало RuntimeError → таск падал в retry → status=failed,
# хотя 50 компаний (5 страниц × 10) уже были сохранены. Сейчас просто break.
MAX_PAGES = 5
REVIEWS_PAGE_SIZE = 50
REVIEWS_PUBLIC_PAGE_SIZE = 50  # widget-API без проблем держит limit=50


def resolve_region_id(city: str) -> int:
    """Sync-резолвер: только хардкод-словарь, без API. Для тестов и совместимости.

    Production-код использует TwoGisProvider._get_region_id_async (async), который
    плюс к этому ходит в /region/search для городов, которых нет в CITY_TO_REGION_ID,
    и кэширует результат в _DYNAMIC_REGION_CACHE на время жизни процесса.
    """
    key = (city or "").strip().lower()
    return CITY_TO_REGION_ID.get(key, TWOGIS_FALLBACK_REGION_ID)


# In-memory кэш для динамически разрешённых region_id. Заполняется при первом
# обращении к городу, которого нет в CITY_TO_REGION_ID. Живёт пока жив процесс
# celery-воркера / backend'а — достаточно, перезапуски редкие.
_DYNAMIC_REGION_CACHE: dict[str, int] = {}


async def _resolve_region_id_via_api(city: str, api_key: str) -> int | None:
    """Дёргает 2GIS /region/search для точного region_id города.

    Возвращает int если найдено, None при любой ошибке/пустом ответе. Caller
    должен сам fallback'нуться на TWOGIS_FALLBACK_REGION_ID, если None.
    """
    if not city or not api_key:
        return None
    url = f"{BASE_URL_2}/region/search"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params={"q": city, "key": api_key})
            if resp.status_code != 200:
                logger.warning(
                    "2gis region/search http %d for %r: %s",
                    resp.status_code, city, (resp.text or "")[:200],
                )
                return None
            data = resp.json()
            meta = data.get("meta") or {}
            if isinstance(meta.get("code"), int) and meta["code"] >= 400:
                logger.warning(
                    "2gis region/search meta.code=%s for %r: %s",
                    meta["code"], city, meta.get("error"),
                )
                return None
            items = (data.get("result") or {}).get("items") or []
            if not items:
                logger.info("2gis region/search %r: пустой result.items", city)
                return None
            # Приоритет: type=city (главный город) над административными
            # единицами (region/district), которые могут оказаться первыми.
            for item in items:
                if (item.get("type") or "").lower() == "city":
                    rid = item.get("id")
                    if rid is not None:
                        logger.info(
                            "2gis region/search %r → id=%s (type=city, name=%r)",
                            city, rid, item.get("name"),
                        )
                        return int(rid)
            rid = items[0].get("id")
            if rid is None:
                return None
            logger.info(
                "2gis region/search %r → id=%s (первый item, type=%r, name=%r)",
                city, rid, items[0].get("type"), items[0].get("name"),
            )
            return int(rid)
    except Exception as e:
        logger.warning("2gis region/search exception for %r: %s", city, e)
        return None


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


def _extract_emails_and_extra(item: dict[str, Any]) -> tuple[list[str], dict[str, list[str]]]:
    """Достаёт все email-ы и мессенджеры/соцсети из contact_groups.

    2GIS Catalog API в contact_groups[].contacts[] кладёт type: email, jabber,
    icq, skype, telegram, whatsapp, viber, vkontakte (или vk), instagram,
    facebook, twitter и др. Раньше мы их игнорировали и сохраняли только
    phone+website — отсюда у юзера «контактов нет» в drawer даже когда
    в карточке 2GIS они видны.

    Дополнительные телефоны (со 2-го) тоже попадают в extra.phones — основной
    остаётся в Company.phone, остальные дублируются в JSONB.
    """
    emails: list[str] = []
    extra: dict[str, list[str]] = {}

    # Маппинг 2GIS-type → ключ в contacts_extra (соответствует ContactsBlock
    # на фронте: phones, telegrams, vks, whatsapps).
    extra_keys = {
        "telegram": "telegrams",
        "whatsapp": "whatsapps",
        "viber": "vibers",
        "vkontakte": "vks",
        "vk": "vks",
        "instagram": "instagrams",
        "facebook": "facebooks",
        "youtube": "youtubes",
    }

    main_phone_seen = False
    for group in item.get("contact_groups") or []:
        for contact in group.get("contacts") or []:
            ctype = (contact.get("type") or "").lower()
            value = contact.get("value")
            if not value:
                continue
            value = str(value).strip()
            if not value:
                continue

            if ctype == "email":
                if value not in emails:
                    emails.append(value)
            elif ctype == "phone":
                if not main_phone_seen:
                    main_phone_seen = True
                    continue  # основной телефон сохранится через _extract_phone
                extra.setdefault("phones", []).append(value)
            elif ctype in extra_keys:
                bucket = extra_keys[ctype]
                lst = extra.setdefault(bucket, [])
                if value not in lst:
                    lst.append(value)

    return emails, extra


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

    emails, contacts_extra = _extract_emails_and_extra(item)

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
        emails=emails or None,
        contacts_extra=contacts_extra or None,
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


def _map_public_review_to_review_raw(item: dict[str, Any]) -> ReviewRaw | None:
    """Маппинг ответа public-api.reviews.2gis.com (widget API) → ReviewRaw.

    Формат отличается от catalog reviews/list:
    - top-level `reviews` (а не `result.items`)
    - ответ владельца: `official_answer` (dict) или `comments[].is_official`
    - дата: `date_edited` приоритетнее `date_created`
    """
    raw_text = item.get("text")
    rating = item.get("rating")
    if raw_text is None and rating is None:
        return None

    user = item.get("user") or {}
    # Имя автора может лежать в user.name или first_name+last_name
    author_name = user.get("name")
    if not author_name:
        first = user.get("first_name") or ""
        last = user.get("last_name") or ""
        author_name = (first + " " + last).strip() or None

    # Owner reply: либо явный official_answer, либо comment с is_official=True
    has_owner_reply = bool(item.get("official_answer"))
    if not has_owner_reply:
        for c in (item.get("comments") or []):
            if c.get("is_official"):
                has_owner_reply = True
                break

    return ReviewRaw(
        source="2gis",
        external_id=str(item["id"]) if item.get("id") is not None else None,
        author_masked=mask_author(author_name),
        rating=int(rating) if rating is not None else None,
        raw_text=raw_text,
        source_url=item.get("url"),
        posted_at=_parse_iso_or_none(item.get("date_edited") or item.get("date_created")),
        has_owner_reply=has_owner_reply,
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
            data = resp.json()
            # 2GIS отдаёт HTTP 200 + meta.code != 200 при логических ошибках
            # (page_size вне диапазона, ничего не найдено по запросу, неподдерживаемая
            # категория, нечитаемая ниша вроде опечаток). Без этой проверки items=[]
            # и парсер тихо завершается с yielded=0 — приходится лезть в логи 2GIS вручную.
            meta = data.get("meta") or {}
            meta_code = meta.get("code")
            if isinstance(meta_code, int) and meta_code >= 400:
                err = (meta.get("error") or {}).get("message") or str(meta.get("error"))
                if meta_code in (401, 403):
                    logger.error(
                        "2gis API auth error %s on %s: %s (params=%s)", meta_code, url, err, params,
                    )
                    raise MissingAPIKeyError(f"2GIS meta.code={meta_code}: {err}")
                # Любые другие meta.code (400 «ничего не найдено» / «параметр X неверен» /
                # 404 «Method not found» на reviews/list) — это НЕ повод валить весь
                # search-таск. Логируем warning и возвращаем пустую структуру, чтобы
                # caller завершился с yielded=0 и search получил status='completed'
                # без companies. RuntimeError бросаем только на reviews/list — там
                # caller (fetch_reviews_catalog) ловит и fallback'ит на public API.
                logger.warning(
                    "2gis API logical %s on %s: %s (params=%s) — возвращаем пусто",
                    meta_code, url, err, params,
                )
                if "/reviews/list" in url:
                    raise RuntimeError(f"2GIS API error (meta.code={meta_code}): {err}")
                return {"meta": meta, "result": {"items": [], "total": 0}}
            return data

        if last_exc:
            raise last_exc
        raise RateLimitError(f"2GIS rate limit/server error не отпустил после 3 ретраев: {url}")

    async def _get_region_id(self, city: str) -> int:
        """Резолвит region_id для города: сначала хардкод-словарь, затем
        динамический кэш процесса, затем /region/search API, иначе fallback.

        После первого успешного API-резолва результат кэшируется в
        _DYNAMIC_REGION_CACHE — повторные поиски в этом городе уже не дёргают сеть.
        """
        key = (city or "").strip().lower()
        if not key:
            return TWOGIS_FALLBACK_REGION_ID
        if key in CITY_TO_REGION_ID:
            return CITY_TO_REGION_ID[key]
        if key in _DYNAMIC_REGION_CACHE:
            return _DYNAMIC_REGION_CACHE[key]
        rid = await _resolve_region_id_via_api(city, self._api_key)
        if rid is not None:
            _DYNAMIC_REGION_CACHE[key] = rid
            logger.info("2gis region resolved via API: %r → region_id=%d", city, rid)
            return rid
        logger.info(
            "2gis region fallback for %r → region_id=%d (Россия, фильтрация по адресу)",
            city, TWOGIS_FALLBACK_REGION_ID,
        )
        return TWOGIS_FALLBACK_REGION_ID

    async def geocode(self, address: str) -> dict | None:
        """Геокодирование адреса через 2GIS.

        Возвращает {"lat": ..., "lng": ..., "city": ..., "matched": "..."} или None.
        Используется в режиме «поиск по радиусу» — юзер вводит адрес, мы получаем
        точку и потом ищем компании вокруг.

        Под капотом — обычный /3.0/items?q={address}&type=adm_div.settlement,attraction,building
        — 2GIS отдаёт первый match.
        """
        if not address or not address.strip():
            return None
        url = f"{BASE_URL_3}/items/geocode"
        params = {
            "q": address.strip(),
            "key": self._api_key,
            "fields": "items.point,items.adm_div,items.full_address_name",
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, params=params)
                if resp.status_code != 200:
                    logger.warning("2gis geocode http %d for %r", resp.status_code, address)
                    return None
                data = resp.json()
                meta = data.get("meta") or {}
                if isinstance(meta.get("code"), int) and meta["code"] >= 400:
                    logger.warning("2gis geocode meta.code=%s for %r", meta["code"], address)
                    return None
                items = (data.get("result") or {}).get("items") or []
                if not items:
                    return None
                item = items[0]
                point = item.get("point") or {}
                lat = point.get("lat")
                lng = point.get("lon")
                if lat is None or lng is None:
                    return None
                # Город из adm_div: ищем элемент с type='city' или 'settlement'
                city = None
                for adm in item.get("adm_div") or []:
                    if (adm.get("type") or "").lower() in ("city", "settlement"):
                        city = adm.get("name")
                        if city:
                            break
                return {
                    "lat": float(lat),
                    "lng": float(lng),
                    "city": city,
                    "matched": item.get("full_address_name") or item.get("name"),
                }
        except Exception as e:
            logger.warning("2gis geocode exception for %r: %s", address, e)
            return None

    async def search_companies(
        self,
        niche: str,
        city: str,
        limit: int = 100,
        *,
        point: tuple[float, float] | None = None,
        radius_meters: int | None = None,
    ) -> AsyncIterator[CompanyRaw]:
        """Стримит компании по нише.

        Режимы:
        - city (point=None): используется region_id, поиск по всему городу.
        - radius (point=(lat,lng), radius_meters>0): конкурентный режим,
          ищет компании в радиусе вокруг точки. region_id не передаётся —
          2GIS сам определяет регион по координатам.
        """
        url = f"{BASE_URL_3}/items"
        common: dict[str, Any] = {
            "q": niche,
            "key": self._api_key,
            "fields": "items.point,items.contact_groups,items.reviews,items.rubrics,items.full_address_name",
            "page_size": PAGE_SIZE,
        }
        region_id: int | None = None
        if point is not None and radius_meters and radius_meters > 0:
            common["point"] = f"{point[1]},{point[0]}"  # 2GIS: lon,lat
            common["radius"] = int(radius_meters)
        else:
            region_id = await self._get_region_id(city)
            common["region_id"] = region_id

        yielded = 0
        page = 1
        async with httpx.AsyncClient(timeout=15.0) as client:
            while yielded < limit:
                params = {**common, "page": page}
                logger.info(
                    "2gis search: niche=%r city=%r region_id=%s point=%s radius=%s page=%d yielded=%d",
                    niche, city, region_id,
                    common.get("point"), common.get("radius"),
                    page, yielded,
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

                if page >= MAX_PAGES:
                    logger.info(
                        "2gis search: достигнут потолок страниц (%d) на free-плане, "
                        "yielded=%d (max %d на free)",
                        MAX_PAGES, yielded, MAX_PAGES * PAGE_SIZE,
                    )
                    break

                page += 1
                await asyncio.sleep(self._delay)

    async def fetch_reviews(
        self,
        company_external_id: str,
        limit: int = 100,
    ) -> AsyncIterator[ReviewRaw]:
        """Стримит отзывы компании. Стратегии:

        1. Сначала Catalog `/2.0/reviews/list` — работает только на платном плане
           2GIS API Pro. На бесплатном/демо-ключе возвращает meta.code=404
           "Method not found" (внутри `_request` это превращается в RuntimeError).
        2. Если Catalog не отдал данных (исключение или 0 отзывов) и
           settings.TWOGIS_REVIEWS_PUBLIC_API_ENABLED — пробуем widget API
           `public-api.reviews.2gis.com/2.0/branches/{id}/reviews`. Это тот же
           endpoint, что использует 2gis.ru при отрисовке карточки; платный
           ключ ему не нужен.

        Если оба источника не дали отзывов — генератор просто завершается
        пустым; вызывающий код (`parse_company_reviews`) не валит таск.
        """
        yielded = 0
        async for review in self._fetch_reviews_catalog(company_external_id, limit):
            yielded += 1
            yield review
            if yielded >= limit:
                return

        if not settings.TWOGIS_REVIEWS_PUBLIC_API_ENABLED:
            return

        async for review in self._fetch_reviews_public_api(company_external_id, limit - yielded):
            yielded += 1
            yield review
            if yielded >= limit:
                return

    async def _fetch_reviews_catalog(
        self,
        company_external_id: str,
        limit: int,
    ) -> AsyncIterator[ReviewRaw]:
        """Платный `/2.0/reviews/list`. На бесплатном ключе всегда падает в RuntimeError —
        ловим его и тихо завершаемся (fallback на widget сделает caller)."""
        if limit <= 0:
            return
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
                logger.debug(
                    "2gis catalog reviews: company=%s offset=%d yielded=%d",
                    company_external_id, offset, yielded,
                )
                try:
                    data = await self._request(client, url, params)
                except RuntimeError as e:
                    # Method not found на free-плане — это ожидаемо, лог только в DEBUG
                    logger.debug(
                        "2gis catalog reviews недоступен для company=%s: %s — переходим на public API",
                        company_external_id, e,
                    )
                    return

                items = (data.get("result") or {}).get("items") or []
                if not items:
                    return

                for item in items:
                    if yielded >= limit:
                        return
                    review = _map_review_to_review_raw(item)
                    if review is None:
                        continue
                    yield review
                    yielded += 1

                if len(items) < REVIEWS_PAGE_SIZE:
                    return
                offset += REVIEWS_PAGE_SIZE
                await asyncio.sleep(self._delay)

    async def _fetch_reviews_public_api(
        self,
        company_external_id: str,
        limit: int,
    ) -> AsyncIterator[ReviewRaw]:
        """Бесплатный widget API: public-api.reviews.2gis.com.

        Без платного ключа, с заголовками браузера (Referer/Origin: 2gis.ru).
        Пагинация по offset. Сетевые ошибки и не-2xx ответы логируем как warning
        и тихо завершаемся: parse_company_reviews уже корректно обрабатывает
        отсутствие отзывов.
        """
        if limit <= 0:
            return
        url = REVIEWS_PUBLIC_API_URL.format(branch_id=company_external_id)
        # Минимальный набор параметров. Любые дополнительные `fields`/`locale`/
        # `rated` ломают endpoint с 400 Bad Request на нашем (анонимном) доступе.
        common: dict[str, Any] = {
            "is_advertiser": "false",
            "without_my_first_review": "false",
            "sort_by": "date_edited",
            "limit": REVIEWS_PUBLIC_PAGE_SIZE,
        }
        widget_key = settings.TWOGIS_REVIEWS_PUBLIC_API_KEY
        if widget_key:
            common["key"] = widget_key

        yielded = 0
        offset = 0
        async with httpx.AsyncClient(timeout=15.0, headers=REVIEWS_PUBLIC_HEADERS) as client:
            while yielded < limit:
                params = {**common, "offset": offset}
                logger.info(
                    "2gis public reviews: company=%s offset=%d yielded=%d limit=%d",
                    company_external_id, offset, yielded, limit,
                )
                try:
                    resp = await client.get(url, params=params)
                except httpx.HTTPError as e:
                    logger.warning(
                        "2gis public reviews: network error company=%s: %s",
                        company_external_id, e,
                    )
                    return

                if resp.status_code == 404:
                    # Компания скрыта/удалена в 2GIS — отзывов больше не будет
                    logger.info(
                        "2gis public reviews 404 для company=%s (компания недоступна)",
                        company_external_id,
                    )
                    return
                if resp.status_code in (401, 403):
                    logger.warning(
                        "2gis public reviews %d для company=%s — widget API требует key. "
                        "Задайте TWOGIS_REVIEWS_PUBLIC_API_KEY или отключите TWOGIS_REVIEWS_PUBLIC_API_ENABLED.",
                        resp.status_code, company_external_id,
                    )
                    return
                if resp.status_code == 429:
                    logger.warning(
                        "2gis public reviews 429 для company=%s — backoff 30s",
                        company_external_id,
                    )
                    await asyncio.sleep(30)
                    continue
                if resp.status_code >= 500:
                    logger.warning(
                        "2gis public reviews %d server error для company=%s — прерываем",
                        resp.status_code, company_external_id,
                    )
                    return
                if resp.status_code != 200:
                    # Логируем тело — у 2GIS public API текст ошибки часто внутри,
                    # без него отлаживать формат параметров невозможно.
                    body_preview = (resp.text or "")[:400]
                    logger.warning(
                        "2gis public reviews unexpected %d для company=%s — прерываем. body=%s",
                        resp.status_code, company_external_id, body_preview,
                    )
                    return

                try:
                    data = resp.json()
                except ValueError:
                    logger.warning(
                        "2gis public reviews: не-JSON ответ для company=%s — прерываем",
                        company_external_id,
                    )
                    return

                items = data.get("reviews") or []
                if not items:
                    return

                for item in items:
                    if yielded >= limit:
                        return
                    review = _map_public_review_to_review_raw(item)
                    if review is None:
                        continue
                    yield review
                    yielded += 1

                if len(items) < REVIEWS_PUBLIC_PAGE_SIZE:
                    return
                offset += REVIEWS_PUBLIC_PAGE_SIZE
                await asyncio.sleep(self._delay)
