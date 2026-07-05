"""API для управления настройками провайдеров карт (2GIS / Yandex / Google).

Singleton-per-provider_id (3 строки в map_provider_config). Все эндпоинты
требуют superuser (кроме /status — он публичный, для бейджей в UI).

Монтируется в maps/router.py через include_router.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_id, require_superuser
from app.core.database import get_db
from app.models.user import User
from app.modules.maps import providers_settings_service as svc
from app.modules.maps.providers_registry import get_all_provider_ids

router = APIRouter(
    # Без prefix — роутер монтируется через router.include_router() внутри
    # maps_router (у которого уже есть prefix="/maps"). Префикс задаём в путях.
    tags=["Maps Providers Settings"],
)


class MapProviderConfigUpdate(BaseModel):
    """Тело для PUT. None/''/'***' не перезаписывают существующие секреты."""

    api_key: Optional[str] = None
    secondary_key: Optional[str] = None
    is_enabled: Optional[bool] = None
    notes: Optional[str] = None


class TestResult(BaseModel):
    ok: bool
    result_count: Optional[int] = None
    error: Optional[str] = None


def _check_provider_id(provider_id: str) -> None:
    if provider_id not in get_all_provider_ids():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown map provider: {provider_id}",
        )


@router.get("/providers-settings")
async def list_provider_settings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superuser),
):
    """Список 3 провайдеров с метаданными + ключи (маскированы)."""
    return await svc.get_all_configs_public(db)


@router.get("/providers-settings/status")
async def provider_settings_status(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Краткий статус каждого провайдера для бейджей в UI.

    Публичный (любой авторизованный). Возвращает {provider_id: 'ok'|'no_api_key'|'disabled'|'no_proxy'}.
    """
    _ = user_id
    return await svc.get_status(db)


@router.put("/providers-settings/{provider_id}")
async def update_provider_settings(
    provider_id: str,
    body: MapProviderConfigUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superuser),
):
    """Обновить конфиг провайдера. Только superuser.

    Секреты с sentinel-значениями ('***', '', None) НЕ перезаписывают
    уже сохранённые ключи — это позволяет UI отправлять всю форму целиком.
    """
    _check_provider_id(provider_id)
    try:
        row = await svc.update_config(db, provider_id, body.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return svc.row_to_dict(row)


@router.post("/providers-settings/{provider_id}/test", response_model=TestResult)
async def test_provider(
    provider_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superuser),
):
    """Реальный тест-вызов провайдера. Только superuser.

    - 2GIS:       Catalog API ping (или widget fallback).
    - Yandex:     проверка USE_PROXY + HTTP-доступность яндекса через прокси.
    - Google:     SerpAPI engine=google_maps с простым запросом.
    """
    _check_provider_id(provider_id)
    try:
        result = await svc.test_provider(db, provider_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return TestResult(**result)
