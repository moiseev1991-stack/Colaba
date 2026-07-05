"""API для управления настройками каналов рассылки (telegram/whatsapp/max).

Singleton-per-channel_id (3 строки в channel_config). Все эндпоинты
требуют superuser (кроме /status — он публичный для бейджей в UI).

Монтируется в outreach/router.py через include_router.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id, require_superuser
from app.models.user import User
from app.modules.outreach import channels_service as svc

router = APIRouter(tags=["Channels Settings"])


class ChannelConfigUpdate(BaseModel):
    """Тело для PUT. config может содержать разные поля по каналу."""

    config: Optional[dict[str, Any]] = None
    enabled: Optional[bool] = None


class TestResult(BaseModel):
    ok: bool
    error: Optional[str] = None


def _check_channel_id(channel_id: str) -> None:
    if channel_id not in svc.SUPPORTED_CHANNEL_IDS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown channel: {channel_id}",
        )


@router.get("/channels-settings")
async def list_channel_settings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superuser),
):
    """Список 3 каналов с метаданными + кредентиалы (маскированы)."""
    return await svc.get_all_channels_public(db)


@router.get("/channels-settings/status")
async def channel_settings_status(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Краткий статус каждого канала: 'ok' | 'no_credentials' | 'disabled'."""
    _ = user_id
    return await svc.get_status(db)


@router.put("/channels-settings/{channel_id}")
async def update_channel_settings(
    channel_id: str,
    body: ChannelConfigUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superuser),
):
    """Обновить конфиг канала. Только superuser."""
    _check_channel_id(channel_id)
    try:
        row = await svc.update_channel(db, channel_id, body.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return svc.row_to_dict(row)


@router.post("/channels-settings/{channel_id}/test", response_model=TestResult)
async def test_channel(
    channel_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superuser),
):
    """Реальный тест подключения канала. Только superuser."""
    _check_channel_id(channel_id)
    result = await svc.test_channel(db, channel_id)
    return TestResult(**result)
