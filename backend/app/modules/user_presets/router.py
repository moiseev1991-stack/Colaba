"""HTTP API модуля user_presets. Префикс /user-presets.

Все endpoints требуют авторизации. Scope — user-level (каждый видит свои).
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.rate_limit import limiter
from app.modules.user_presets import service
from app.modules.user_presets.schemas import (
    StarterPresetOut,
    UserPresetCreate,
    UserPresetOut,
    UserPresetUpdate,
)
from app.modules.user_presets.starter_presets import (
    get_starter_by_slug,
    list_starter_presets,
)


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/user-presets", tags=["user-presets"])


@router.get("", response_model=list[UserPresetOut])
@limiter.limit("120/minute")
async def list_my_presets(
    request: Request,
    module: str = Query(default="maps", max_length=20),
    # hidden=false → активные (default), true → скрытые, не передан → все
    hidden: Optional[bool] = Query(default=False),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    rows = await service.list_for_user(db, user_id=user_id, module=module, hidden=hidden)
    return [UserPresetOut.model_validate(r) for r in rows]


@router.post("", response_model=UserPresetOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
async def create_preset(
    request: Request,
    payload: UserPresetCreate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    try:
        preset = await service.create(
            db,
            user_id=user_id,
            organization_id=None,
            module=payload.module,
            name=payload.name,
            description=payload.description,
            filter=payload.filter,
            ai_prompt=payload.ai_prompt,
        )
    except IntegrityError as e:
        await db.rollback()
        # Уникальный констрейнт user_id × module × name — самый частый
        # случай конфликта на этой таблице. Сообщаем юзеру явно.
        logger.info("create_preset duplicate name for user=%s: %s", user_id, e)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Пресет с именем «{payload.name}» уже существует. Выберите другое имя.",
        )
    return UserPresetOut.model_validate(preset)


@router.patch("/{preset_id}", response_model=UserPresetOut)
@limiter.limit("30/minute")
async def update_preset(
    request: Request,
    preset_id: int,
    payload: UserPresetUpdate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    preset = await service.get_owned(db, preset_id=preset_id, user_id=user_id)
    if preset is None:
        raise HTTPException(status_code=404, detail="Пресет не найден")
    try:
        updated = await service.update(
            db,
            preset=preset,
            name=payload.name,
            description=payload.description,
            filter=payload.filter,
            hidden=payload.hidden,
            ai_prompt=payload.ai_prompt,
        )
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Пресет с именем «{payload.name}» уже существует.",
        )
    return UserPresetOut.model_validate(updated)


@router.delete("/{preset_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def delete_preset(
    request: Request,
    preset_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    ok = await service.delete_preset(db, preset_id=preset_id, user_id=user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Пресет не найден")


# ---------------------------------------------------------------------------
# Стартовые (системные) пресеты — read-only, видны всем.
# ---------------------------------------------------------------------------


@router.get("/starter", response_model=list[StarterPresetOut])
@limiter.limit("120/minute")
async def list_starter(
    request: Request,
    user_id: int = Depends(get_current_user_id),
):
    """Возвращает встроенные стартовые пресеты. Авторизация нужна
    (как и у обычных пресетов) — чтобы не тратить трафик у роботов."""
    return [StarterPresetOut.model_validate(p) for p in list_starter_presets()]


@router.post(
    "/starter/{slug}/clone",
    response_model=UserPresetOut,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("30/minute")
async def clone_starter(
    request: Request,
    slug: str,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Копирует стартовый пресет в пользовательские. После клона юзер
    может его править, скрывать, удалять как обычный."""
    src = get_starter_by_slug(slug)
    if src is None:
        raise HTTPException(status_code=404, detail="Стартовый пресет не найден")
    try:
        preset = await service.create(
            db,
            user_id=user_id,
            organization_id=None,
            module="maps",
            name=src["name"],
            description=src.get("description"),
            filter=src["filter"],
            ai_prompt=src.get("ai_prompt"),
        )
    except IntegrityError:
        await db.rollback()
        # У юзера уже есть пресет с этим именем — для UX делаем подсказку.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"У вас уже есть пресет «{src['name']}» — переименуйте его "
                "или удалите, чтобы склонировать стартовый заново."
            ),
        )
    return UserPresetOut.model_validate(preset)
