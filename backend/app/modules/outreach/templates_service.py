"""Бизнес-логика пользовательских outreach-шаблонов.

Простые CRUD с user-scope: каждый юзер видит только свои. Конфликт имён
(user_id, name) ловится через IntegrityError → HTTPException 409 на
API-слое. Паттерн аналогичен user_presets/service.py.
"""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_outreach_template import UserOutreachTemplate
from app.modules.outreach.templates_schemas import (
    UserOutreachTemplateCreate,
    UserOutreachTemplateUpdate,
)


async def list_for_user(
    db: AsyncSession,
    user_id: int,
    module: str | None = None,
) -> list[UserOutreachTemplate]:
    """Шаблоны пользователя, новые сверху.

    module=None — все модули; иначе фильтр по конкретному ('seo', 'leads', ...).
    """
    stmt = select(UserOutreachTemplate).where(
        UserOutreachTemplate.user_id == user_id
    )
    if module is not None:
        stmt = stmt.where(UserOutreachTemplate.module == module)
    stmt = stmt.order_by(UserOutreachTemplate.created_at.desc())
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


async def get_owned(
    db: AsyncSession,
    template_id: int,
    user_id: int,
) -> UserOutreachTemplate | None:
    """Возвращает шаблон, только если он принадлежит этому юзеру."""
    stmt = select(UserOutreachTemplate).where(
        UserOutreachTemplate.id == template_id,
        UserOutreachTemplate.user_id == user_id,
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def create(
    db: AsyncSession,
    *,
    user_id: int,
    organization_id: int | None,
    payload: UserOutreachTemplateCreate,
) -> UserOutreachTemplate:
    """Создаёт шаблон. Конфликт (user_id, name) → IntegrityError, ловит caller."""
    tpl = UserOutreachTemplate(
        user_id=user_id,
        organization_id=organization_id,
        name=payload.name.strip(),
        subject=payload.subject.strip(),
        body=payload.body.strip(),
        module=(payload.module or "seo").strip() or "seo",
    )
    db.add(tpl)
    await db.commit()
    await db.refresh(tpl)
    return tpl


async def update(
    db: AsyncSession,
    *,
    template: UserOutreachTemplate,
    payload: UserOutreachTemplateUpdate,
) -> UserOutreachTemplate:
    """Частичное обновление: применяются только non-None поля."""
    if payload.name is not None:
        template.name = payload.name.strip()
    if payload.subject is not None:
        template.subject = payload.subject.strip()
    if payload.body is not None:
        template.body = payload.body.strip()
    if payload.module is not None:
        template.module = payload.module.strip() or "seo"
    if payload.is_default is not None:
        template.is_default = payload.is_default
    await db.commit()
    await db.refresh(template)
    return template


async def delete_template(
    db: AsyncSession, *, template_id: int, user_id: int
) -> bool:
    """Удаление с проверкой user-scope. True если что-то удалили."""
    stmt = delete(UserOutreachTemplate).where(
        UserOutreachTemplate.id == template_id,
        UserOutreachTemplate.user_id == user_id,
    )
    result = await db.execute(stmt)
    await db.commit()
    return (result.rowcount or 0) > 0
