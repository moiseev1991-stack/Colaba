"""HTTP API для пользовательских outreach-шаблонов.

Префикс /templates монтируется под /outreach в outreach/router.py,
итоговый путь — /api/v1/outreach/templates. Совпадает с контрактом
фронт-сервиса outreachTemplates.ts, который ранее стучался сюда вхолостую
и работал через localStorage-фолбэк.

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
from app.modules.outreach import templates_service as service
from app.modules.outreach.templates_schemas import (
    UserOutreachTemplateCreate,
    UserOutreachTemplateOut,
    UserOutreachTemplateUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/templates", tags=["outreach-templates"])


@router.get("", response_model=list[UserOutreachTemplateOut])
@limiter.limit("120/minute")
async def list_my_templates(
    request: Request,
    module: Optional[str] = Query(default=None, max_length=50),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    rows = await service.list_for_user(db, user_id=user_id, module=module)
    return [UserOutreachTemplateOut.model_validate(r) for r in rows]


@router.post(
    "",
    response_model=UserOutreachTemplateOut,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("30/minute")
async def create_template(
    request: Request,
    payload: UserOutreachTemplateCreate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    try:
        tpl = await service.create(
            db,
            user_id=user_id,
            organization_id=None,
            payload=payload,
        )
    except IntegrityError:
        await db.rollback()
        # UniqueConstraint(user_id, name) — самый частый конфликт.
        logger.info(
            "create_template duplicate name for user=%s: %s",
            user_id,
            payload.name,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Шаблон с именем «{payload.name}» уже существует. "
                "Выберите другое имя."
            ),
        )
    return UserOutreachTemplateOut.model_validate(tpl)


@router.patch("/{template_id}", response_model=UserOutreachTemplateOut)
@limiter.limit("30/minute")
async def update_template(
    request: Request,
    template_id: int,
    payload: UserOutreachTemplateUpdate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    tpl = await service.get_owned(db, template_id=template_id, user_id=user_id)
    if tpl is None:
        # Не палит существование чужой сущности — единый 404.
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    try:
        updated = await service.update(db, template=tpl, payload=payload)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Шаблон с именем «{payload.name}» уже существует. "
                "Выберите другое имя."
            ),
        )
    return UserOutreachTemplateOut.model_validate(updated)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def delete_template(
    request: Request,
    template_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    ok = await service.delete_template(
        db, template_id=template_id, user_id=user_id
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
