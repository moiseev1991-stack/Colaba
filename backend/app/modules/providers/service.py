"""
Сервис провайдеров: get_provider_config, список для API, upsert, маскирование секретов.
"""

import logging
from datetime import datetime

from sqlalchemy import select

logger = logging.getLogger(__name__)

from app.core.config import settings
from app.models import SearchProviderConfig

from app.modules.providers.registry import PROVIDER_REGISTRY


def _get_registry_entry(provider_id: str) -> dict | None:
    for p in PROVIDER_REGISTRY:
        if p["id"] == provider_id:
            return p
    return None


def _mask_secrets(config: dict, schema: list) -> dict:
    out = dict(config)
    for f in schema:
        if f.get("secret") and f["key"] in out and out[f["key"]]:
            out[f["key"]] = "***"
    return out


def _is_configured(provider_id: str, config: dict, schema: list) -> bool:
    for f in schema:
        if not f.get("required"):
            continue
        v = config.get(f["key"])
        if f["type"] == "bool":
            if v is None:
                return False
        else:
            if not (v and str(v).strip()):
                return False
    return True


async def get_providers_list(db) -> list:
    """Список провайдеров: реестр + config из БД (секреты замаскированы), configured."""
    out = []
    try:
        for p in PROVIDER_REGISTRY:
            pid = p["id"]
            merged = await get_provider_config(pid, db)
            masked = _mask_secrets(merged, p["settings_schema"])
            out.append({
                **{k: v for k, v in p.items() if k != "settings_schema"},
                "settings_schema": p["settings_schema"],
                "config": masked,
                "configured": _is_configured(pid, merged, p["settings_schema"]),
            })
        return out
    except Exception as e:
        logger.exception("get_providers_list failed: %s", e)
        raise


async def get_provider_detail(provider_id: str, db) -> dict | None:
    """Один провайдер: реестр + config (маскировано)."""
    entry = _get_registry_entry(provider_id)
    if not entry:
        return None
    merged = await get_provider_config(provider_id, db)
    masked = _mask_secrets(merged, entry["settings_schema"])
    return {
        **entry,
        "config": masked,
        "configured": _is_configured(provider_id, merged, entry["settings_schema"]),
    }


def _validate_config(config: dict, schema: list) -> None:
    """Raises ValueError if config doesn't match settings_schema (required when value given, types). Secrets «***»/omit = keep."""
    for f in schema:
        k = f["key"]
        v = config.get(k)
        # Секрет "***" или отсутствие — оставляем как есть, в upsert подставится existing
        if f.get("secret") and (v is None or v == "" or v == "***"):
            continue
        if f.get("required"):
            if f["type"] == "bool":
                if v is None:
                    raise ValueError(f"Поле '{k}' обязательно")
            else:
                if not (v is not None and str(v).strip()):
                    raise ValueError(f"Поле '{k}' обязательно и не должно быть пустым")
        if v is not None and f["type"] == "bool" and not isinstance(v, bool):
            if isinstance(v, str) and v.lower() in ("true", "false", "1", "0", "yes", "no"):
                pass
            elif isinstance(v, (int, float)) and v in (0, 1):
                pass
            else:
                raise ValueError(f"Поле '{k}' должно быть boolean")


async def get_provider_config(provider_id: str, db) -> dict:
    """
    Настройки провайдера: из БД с подстановкой из env, если в config пусто.

    - yandex_html, google_html: use_proxy, proxy_url, proxy_list ← USE_PROXY, PROXY_URL, PROXY_LIST
    - yandex_xml: folder_id, api_key ← YANDEX_XML_FOLDER_ID, YANDEX_XML_KEY (Yandex Cloud)
    - serpapi: api_key ← SERPAPI_KEY
    - duckduckgo: только config (region и т.п.)
    """
    result = await db.execute(select(SearchProviderConfig).where(SearchProviderConfig.provider_id == provider_id))
    row = result.scalar_one_or_none()
    db_config = dict(row.config) if row and row.config else {}

    merged = dict(db_config)

    if provider_id in ("yandex_html", "google_html"):
        if "use_proxy" not in merged:
            merged["use_proxy"] = settings.USE_PROXY
        if not merged.get("proxy_url"):
            merged["proxy_url"] = settings.PROXY_URL or ""
        if not merged.get("proxy_list"):
            merged["proxy_list"] = settings.PROXY_LIST or ""

    if provider_id == "yandex_xml":
        if not merged.get("folder_id"):
            merged["folder_id"] = getattr(settings, "YANDEX_XML_FOLDER_ID", None) or ""
        if not merged.get("api_key"):
            merged["api_key"] = settings.YANDEX_XML_KEY or ""

    if provider_id == "serpapi":
        if not merged.get("api_key"):
            merged["api_key"] = settings.SERPAPI_KEY or ""

    return merged


async def upsert_provider_config(provider_id: str, config: dict, db) -> SearchProviderConfig:
    """Upsert SearchProviderConfig по provider_id. Конфиг уже провалидирован. Секреты «***» не перезаписываем."""
    entry = _get_registry_entry(provider_id)
    schema = entry["settings_schema"] if entry else []
    secret_keys = {f["key"] for f in schema if f.get("secret")}

    result = await db.execute(select(SearchProviderConfig).where(SearchProviderConfig.provider_id == provider_id))
    row = result.scalar_one_or_none()
    existing = dict(row.config) if row and row.config else {}

    to_save = dict(config)
    for k in secret_keys:
        if to_save.get(k) in (None, "", "***"):
            if k in existing:
                to_save[k] = existing[k]

    if row:
        row.config = to_save
        row.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(row)
        return row
    new_row = SearchProviderConfig(provider_id=provider_id, config=to_save)
    db.add(new_row)
    await db.commit()
    await db.refresh(new_row)
    return new_row
