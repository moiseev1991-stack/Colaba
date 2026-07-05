"""Сервис для управления настройками провайдеров карт.

CRUD + Test connection + хелпер load_provider_keys() для провайдеров.

Паттерн аналогичен email settings_router, но singleton-per-provider_id
(3 строки в map_provider_config вместо одной в email_config).

Ключевая функция — load_provider_keys(): используется провайдерами в
__init__ для чтения ключей. Логика:
1. Читаем MapProviderConfig[provider_id] из БД.
2. Если is_enabled=True и есть api_key/secondary_key → отдаём их.
3. Иначе → fallback на env (TWOGIS_API_KEY, SERPAPI_KEY, ...).

Это сохраняет обратную совместимость: если админ ничего не менял в UI,
ключи продолжают работать из .env.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings as app_settings
from app.models.map_provider_config import MapProviderConfig
from app.modules.maps.providers_registry import (
    MAPS_PROVIDER_REGISTRY,
    get_all_provider_ids,
    get_registry_entry,
)

logger = logging.getLogger(__name__)

MASK = "***"


# ────────────────────────────────────────────────────────────────────
# Чтение / запись конфигов
# ────────────────────────────────────────────────────────────────────


async def _get_or_create_row(db: AsyncSession, provider_id: str) -> MapProviderConfig:
    """Возвращает строку конфига для провайдера; создаёт если нет."""
    result = await db.execute(
        select(MapProviderConfig).where(
            MapProviderConfig.provider_id == provider_id
        )
    )
    row = result.scalar_one_or_none()
    if row:
        return row
    row = MapProviderConfig(provider_id=provider_id)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def get_all_configs(db: AsyncSession) -> list[MapProviderConfig]:
    """Все 3 строки конфигов; создаёт недостающие."""
    rows: dict[str, MapProviderConfig] = {}
    for pid in get_all_provider_ids():
        rows[pid] = await _get_or_create_row(db, pid)
    return [rows[pid] for pid in get_all_provider_ids()]


def mask_value(value: Optional[str]) -> Optional[str]:
    """Маскирует секрет. Пустой → None (UI видит «ключ не задан»), есть → '***'."""
    if value:
        return MASK
    return None


def row_to_dict(row: MapProviderConfig) -> dict[str, Any]:
    """Преобразует row в dict с метаданными из реестра (для UI)."""
    entry = get_registry_entry(row.provider_id) or {}
    return {
        "provider_id": row.provider_id,
        "name": entry.get("name", row.provider_id),
        "description": entry.get("description", ""),
        "source_label": entry.get("source_label", row.provider_id),
        "fields": entry.get("fields", []),
        "api_key": mask_value(row.api_key),
        "secondary_key": mask_value(row.secondary_key),
        "is_enabled": bool(row.is_enabled),
        "is_configured": bool(row.is_configured),
        "last_test_at": row.last_test_at,
        "last_test_result": row.last_test_result,
        "last_test_error": row.last_test_error,
    }


async def get_all_configs_public(db: AsyncSession) -> list[dict[str, Any]]:
    """Список всех конфигов с маскированными секретами для UI."""
    rows = await get_all_configs(db)
    return [row_to_dict(r) for r in rows]


def _apply_secret_update(
    current: Optional[str], new_val: Optional[str]
) -> Optional[str]:
    """Если новое значение None/''/'***' — сохраняем старое (не перезаписываем)."""
    if new_val is None or new_val == "" or new_val == MASK:
        return current
    return new_val


def _compute_is_configured(provider_id: str, api_key: Optional[str], secondary_key: Optional[str]) -> bool:
    """Когда провайдер считается «настроенным» (есть чем работать).

    - twogis: достаточно или api_key, или secondary_key (widget fallback работает один).
    - yandex_maps: всегда True — HTML-парсер без ключа работает, если есть прокси.
    - google_maps: нужен api_key (SerpAPI).
    """
    api_key = (api_key or "").strip()
    secondary_key = (secondary_key or "").strip()
    if provider_id == "twogis":
        return bool(api_key or secondary_key)
    if provider_id == "yandex_maps":
        return True
    if provider_id == "google_maps":
        return bool(api_key)
    return bool(api_key or secondary_key)


async def update_config(
    db: AsyncSession, provider_id: str, data: dict[str, Any]
) -> MapProviderConfig:
    """Partial update конфига с секрет-маской."""
    if provider_id not in get_all_provider_ids():
        raise ValueError(f"unknown provider_id: {provider_id!r}")

    row = await _get_or_create_row(db, provider_id)

    if "api_key" in data:
        row.api_key = _apply_secret_update(row.api_key, data["api_key"])
    if "secondary_key" in data:
        row.secondary_key = _apply_secret_update(
            row.secondary_key, data["secondary_key"]
        )
    if "is_enabled" in data:
        # Pydantic приводит к bool, но на всякий случай — явно.
        row.is_enabled = bool(data["is_enabled"])
    if "notes" in data and data["notes"] is not None:
        row.notes = data["notes"]

    row.is_configured = _compute_is_configured(
        provider_id, row.api_key, row.secondary_key
    )
    row.updated_at = datetime.utcnow()

    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def get_status(db: AsyncSession) -> dict[str, str]:
    """Краткий статус каждого провайдера для бейджей в UI.

    Значения: 'ok' | 'no_api_key' | 'disabled' | 'no_proxy' (для yandex).
    Учитывается is_enabled — если админ выключил провайдер в UI,
    возвращаем 'disabled'.
    """
    rows = await get_all_configs(db)
    out: dict[str, str] = {}
    for row in rows:
        if not row.is_enabled:
            # Fallback: если в БД выключен, но env-ключ есть — всё равно
            # считаем что провайдер «доступен» (обратная совместимость;
            # админ мог настроить через .env и не трогать UI).
            env_ok = _env_fallback_status(row.provider_id)
            out[row.provider_id] = "ok" if env_ok else "disabled"
            continue
        if row.is_configured:
            out[row.provider_id] = "ok"
        else:
            out[row.provider_id] = (
                "no_proxy"
                if row.provider_id == "yandex_maps" and not app_settings.USE_PROXY
                else "no_api_key"
            )
    return out


# ────────────────────────────────────────────────────────────────────
# Fallback на env
# ────────────────────────────────────────────────────────────────────


def _env_fallback_status(provider_id: str) -> bool:
    """Возвращает True если в env есть минимально-достаточный ключ."""
    if provider_id == "twogis":
        return bool(
            (app_settings.TWOGIS_API_KEY or "").strip()
            or (app_settings.TWOGIS_REVIEWS_PUBLIC_API_KEY or "").strip()
        )
    if provider_id == "yandex_maps":
        return bool(app_settings.USE_PROXY)
    if provider_id == "google_maps":
        return bool((app_settings.SERPAPI_KEY or "").strip())
    return False


def load_provider_keys(provider_id: str) -> dict[str, str]:
    """СИНХРОННОЕ чтение ключей для провайдеров в __init__.

    Celery-таски и провайдеры не всегда имеют AsyncSession. Делаем синхронный
    запрос через отдельный engine. Это безопасно: операция лёгкая (1 row by id).

    Возвращает dict {api_key, secondary_key} с приоритетом БД → env:
    - Если в БД is_enabled=True и есть ключ — отдаём его.
    - Иначе — fallback на env (TWOGIS_API_KEY, SERPAPI_KEY, ...).
    - Если ничего нет — пустые строки.
    """
    # Локальный импорт — чтобы избежать циклов на старте приложения.
    from app.core.database import get_sync_session_factory

    env_map = {
        "twogis": {
            "api_key": (app_settings.TWOGIS_API_KEY or "").strip(),
            "secondary_key": (
                app_settings.TWOGIS_REVIEWS_PUBLIC_API_KEY or ""
            ).strip(),
        },
        "yandex_maps": {
            "api_key": "",
            "secondary_key": "",
        },
        "google_maps": {
            "api_key": (app_settings.SERPAPI_KEY or "").strip(),
            "secondary_key": "",
        },
    }
    fallback = env_map.get(provider_id, {"api_key": "", "secondary_key": ""})

    try:
        SyncSessionLocal = get_sync_session_factory()
        with SyncSessionLocal() as db:
            row = (
                db.query(MapProviderConfig)
                .filter(MapProviderConfig.provider_id == provider_id)
                .first()
            )
            if row and row.is_enabled:
                api = (row.api_key or "").strip()
                sec = (row.secondary_key or "").strip()
                return {
                    "api_key": api or fallback["api_key"],
                    "secondary_key": sec or fallback["secondary_key"],
                }
    except Exception as e:
        logger.warning(
            "load_provider_keys(%s) DB-read failed, using env fallback: %s",
            provider_id,
            e,
        )
    return fallback


# ────────────────────────────────────────────────────────────────────
# Test connection
# ────────────────────────────────────────────────────────────────────


async def test_provider(
    db: AsyncSession, provider_id: str
) -> dict[str, Any]:
    """Реальный тест-вызов провайдера.

    Возвращает {ok: bool, result_count?: int, error?: str}.
    Записывает результат в last_test_* поля строки конфига.
    """
    if provider_id not in get_all_provider_ids():
        raise ValueError(f"unknown provider_id: {provider_id!r}")

    row = await _get_or_create_row(db, provider_id)
    keys = load_provider_keys(provider_id)

    try:
        if provider_id == "twogis":
            count = await _test_twogis(keys)
        elif provider_id == "yandex_maps":
            count = await _test_yandex_maps()
        elif provider_id == "google_maps":
            count = await _test_google_maps(keys)
        else:
            raise ValueError(f"test not implemented for {provider_id}")

        row.last_test_at = datetime.utcnow()
        row.last_test_result = "ok"
        row.last_test_error = None
        row.is_configured = True
        db.add(row)
        await db.commit()
        return {"ok": True, "result_count": count}

    except Exception as e:
        logger.warning("Test connection failed for %s: %s", provider_id, e)
        row.last_test_at = datetime.utcnow()
        row.last_test_result = "error"
        row.last_test_error = str(e)[:500]
        db.add(row)
        await db.commit()
        return {"ok": False, "error": str(e)}


async def _test_twogis(keys: dict[str, str]) -> int:
    """2GIS test: Catalog API ping одним поисковым запросом.

    Если есть api_key — используем Catalog API; иначе — widget fallback.
    """
    import httpx

    api_key = keys.get("api_key", "")
    widget_key = keys.get("secondary_key", "")

    # Catalog API: /3.0/items?q=...
    if api_key:
        url = "https://catalog.api.2gis.ru/3.0/items"
        params = {
            "q": "кофе москва",
            "key": api_key,
            "page_size": 5,
            "fields": "items.name",
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(url, params=params)
            r.raise_for_status()
            data = r.json()
            return len(data.get("result", {}).get("items", []))

    # Widget public API (fallback).
    if widget_key:
        url = "https://public-api.reviews.2gis.ru/2.0/catalog/branch/query"
        params = {"q": "кофе москва", "key": widget_key, "page_size": 5}
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(url, params=params)
            r.raise_for_status()
            data = r.json()
            return len(data.get("result", {}).get("items", []))

    raise RuntimeError("Нет ни Catalog API ключа, ни Widget ключа 2GIS")


async def _test_yandex_maps() -> int:
    """Yandex Maps test: проверяем что USE_PROXY включён и прокси отвечает.

    Полноценный Playwright-тест делать долго (старт браузера ~5 сек),
    поэтому на первом этапе — упрощённая проверка конфигурации.
    """
    if not app_settings.USE_PROXY:
        raise RuntimeError(
            "Yandex Maps использует HTML-парсинг через Playwright с прокси. "
            "Включите USE_PROXY в .env чтобы провайдер заработал."
        )
    # Простая HTTP-проверка доступности яндекса через прокси.
    import httpx

    proxy_url = (app_settings.PROXY_URL or "").strip()
    if not proxy_url:
        # PROXY_LIST — список, берём первый.
        proxy_list = (app_settings.PROXY_LIST or "").strip()
        if proxy_list:
            proxy_url = proxy_list.split(",")[0].strip()

    client_kwargs = {"timeout": 15.0}
    if proxy_url:
        client_kwargs["proxy"] = proxy_url

    async with httpx.AsyncClient(**client_kwargs) as client:
        r = await client.get("https://yandex.ru")
        r.raise_for_status()
        # Возвращаем условный «success» — Yandex ответил.
        return 1


async def _test_google_maps(keys: dict[str, str]) -> int:
    """Google Maps test через SerpAPI с простым запросом."""
    api_key = keys.get("api_key", "")
    if not api_key:
        raise RuntimeError("SerpAPI ключ обязателен для Google Maps")

    # Импортируем внутри — serpapi не в requirements.txt как «serpapi»,
    # GoogleMapsProvider использует google-search-results либо httpx напрямую.
    # Используем прямой HTTP-вызов к SerpAPI endpoint.
    import httpx

    url = "https://serpapi.com/search"
    params = {
        "engine": "google_maps",
        "q": "кофе москва",
        "api_key": api_key,
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(url, params=params)
        if r.status_code != 200:
            raise RuntimeError(f"SerpAPI HTTP {r.status_code}: {r.text[:200]}")
        data = r.json()
        return len(data.get("local_results", []) or data.get("places", []) or [])
