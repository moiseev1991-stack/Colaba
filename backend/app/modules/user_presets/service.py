"""Бизнес-логика пользовательских пресетов фильтров.

Простые CRUD-операции с user-scope: каждый юзер видит только свои.
Конфликт имён (один user × один module) ловим через
IntegrityError → HTTPException 409 на API-слое.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_filter_preset import UserFilterPreset


async def list_for_user(
    db: AsyncSession,
    user_id: int,
    module: str = "maps",
    hidden: bool | None = False,
) -> list[UserFilterPreset]:
    """Возвращает пресеты пользователя для указанного модуля, новые сверху.

    hidden=False (default) — только активные, hidden=True — только скрытые,
    hidden=None — все.
    """
    stmt = (
        select(UserFilterPreset)
        .where(UserFilterPreset.user_id == user_id, UserFilterPreset.module == module)
    )
    if hidden is not None:
        stmt = stmt.where(UserFilterPreset.hidden == hidden)
    stmt = stmt.order_by(UserFilterPreset.created_at.desc())
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


async def get_owned(
    db: AsyncSession, preset_id: int, user_id: int,
) -> UserFilterPreset | None:
    """Возвращает пресет, только если он принадлежит этому юзеру."""
    stmt = select(UserFilterPreset).where(
        UserFilterPreset.id == preset_id,
        UserFilterPreset.user_id == user_id,
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def create(
    db: AsyncSession,
    *,
    user_id: int,
    organization_id: int | None,
    module: str,
    name: str,
    description: str | None,
    filter: dict[str, Any],
) -> UserFilterPreset:
    """Создаёт пресет. Конфликт (user_id, module, name) — IntegrityError,
    обрабатывается caller."""
    preset = UserFilterPreset(
        user_id=user_id,
        organization_id=organization_id,
        module=module,
        name=name.strip(),
        description=(description or "").strip() or None,
        filter=filter,
    )
    db.add(preset)
    await db.commit()
    await db.refresh(preset)
    return preset


async def update(
    db: AsyncSession,
    *,
    preset: UserFilterPreset,
    name: str | None = None,
    description: str | None = None,
    filter: dict[str, Any] | None = None,
    hidden: bool | None = None,
) -> UserFilterPreset:
    """Частичное обновление: применяются только non-None поля."""
    if name is not None:
        preset.name = name.strip()
    if description is not None:
        preset.description = description.strip() or None
    if filter is not None:
        preset.filter = filter
    if hidden is not None:
        preset.hidden = hidden
    await db.commit()
    await db.refresh(preset)
    return preset


async def delete_preset(db: AsyncSession, *, preset_id: int, user_id: int) -> bool:
    """Удаление с проверкой user-scope. True если что-то удалили."""
    stmt = delete(UserFilterPreset).where(
        UserFilterPreset.id == preset_id,
        UserFilterPreset.user_id == user_id,
    )
    result = await db.execute(stmt)
    await db.commit()
    return (result.rowcount or 0) > 0
