# -*- coding: utf-8 -*-
"""Тесты авто-onboarding'а: регистрация создаёт личную организацию.

Покрывает регрессию бага «новый юзер без организации получает 404 на
/dashboard и /searches». После фикса register_user автоматически создаёт
«Личный кабинет <email>» и привязывает юзера как OWNER.

Мокаем db через in-memory-like заглушки: проверяем, что регистрация
нового юзера вызывает ensure_user_has_personal_organization, и что
последняя создаёт Organization + user_organizations с OWNER.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.organization import OrganizationRole


@pytest.mark.asyncio
async def test_register_user_creates_personal_org():
    """При регистрации нового юзера вызывается авто-создание org.

    Патчим ensure_user_has_personal_organization и проверяем, что
    register_user делегировал в него создание org. Реальный DB не трогаем.
    """
    from datetime import datetime

    from app.modules.auth import schemas
    from app.modules.auth import service as auth_service

    # Мокаем db: существующих юзеров нет, commit/refresh заглушки.
    db = MagicMock()
    scalar_result = MagicMock()
    scalar_result.scalar_one_or_none = MagicMock(return_value=None)  # email свободен
    db.execute = AsyncMock(return_value=scalar_result)
    db.add = MagicMock()
    db.commit = AsyncMock()

    # refresh должен заполнить user.id/created_at (как сделала бы реальная БД),
    # иначе UserResponse.model_validate упадёт на None полях.
    async def _fake_refresh(obj, *a, **kw):
        if getattr(obj, "id", None) is None:
            obj.id = 999
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime.utcnow()

    db.refresh = _fake_refresh

    # Патчим helper в organisations.service, чтобы изолировать тест от
    # реального создания org (тестируем только, что register вызывает его).
    with patch(
        "app.modules.organizations.service.ensure_user_has_personal_organization",
        new_callable=AsyncMock,
        return_value=None,
    ) as mock_ensure:
        result = await auth_service.register_user(
            db,
            schemas.UserRegister(
                email="newuser_auto_org@example.com",
                password="VeryStrong123!",
            ),
        )

    # User добавлен в сессию и сохранён.
    assert db.add.called, "User должен быть добавлен в db"
    assert db.commit.await_count >= 1
    # Авто-onboarding вызван — это и есть суть фикса.
    assert mock_ensure.await_count == 1, "register_user должен вызвать авто-onboarding"
    # Возвращён валидный UserResponse (id проставлен).
    assert result.id == 999


@pytest.mark.asyncio
async def test_ensure_user_has_personal_organization_skips_when_exists():
    """Если у юзера уже есть org — новая не создаётся (идемпотентность)."""
    from app.models.user import User
    from app.modules.organizations.service import (
        ensure_user_has_personal_organization,
    )

    user = User(
        id=42,
        email="already_has@example.com",
        hashed_password="x",
        is_active=True,
        is_superuser=False,
    )

    db = MagicMock()
    # Первый execute — SELECT organization_id → уже есть (org_id=7).
    existing_result = MagicMock()
    existing_result.scalar_one_or_none = MagicMock(return_value=7)
    db.execute = AsyncMock(return_value=existing_result)
    db.get = AsyncMock(return_value=MagicMock(id=7, name="Старая org"))

    org = await ensure_user_has_personal_organization(db, user)

    # Не должно быть INSERT'ов (add/flush/commit не вызваны).
    assert not db.add.called
    assert org is not None
    assert org.id == 7


@pytest.mark.asyncio
async def test_ensure_user_has_personal_organization_creates_with_owner():
    """Без существующей org — создаётся Organization + user_organizations OWNER."""
    from app.models.user import User
    from app.modules.organizations.service import (
        ensure_user_has_personal_organization,
    )

    user = User(
        id=99,
        email="newbie@example.com",
        hashed_password="x",
        is_active=True,
        is_superuser=False,
    )

    db = MagicMock()
    # Первый execute — SELECT organization_id → нет (None).
    no_org_result = MagicMock()
    no_org_result.scalar_one_or_none = MagicMock(return_value=None)
    # Второй execute — INSERT user_organizations → заглушка.
    db.execute = AsyncMock(return_value=no_org_result)
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    # Сэмулируем, что flush выставил id на organization.
    def _set_org_id(org_obj):
        org_obj.id = 1234

    db.refresh.side_effect = _set_org_id

    org = await ensure_user_has_personal_organization(db, user)

    assert org is not None
    assert org.id == 1234
    assert "Личный кабинет" in org.name
    assert "newbie@example.com" in org.name
    # Должен быть INSERT user_organizations (второй db.execute).
    assert db.execute.await_count >= 2
    # Должен быть add для Organization.
    assert db.add.called


@pytest.mark.asyncio
async def test_ensure_user_has_personal_organization_none_user():
    """Передача None user → None, без вызовов db (защита от None)."""
    from app.modules.organizations.service import (
        ensure_user_has_personal_organization,
    )

    db = MagicMock()
    result = await ensure_user_has_personal_organization(db, None)
    assert result is None
    assert not db.add.called
    assert not db.execute.called


def test_owner_role_enum_exists():
    """OWNER роль определена в enum (используется при авто-onboarding)."""
    assert OrganizationRole.OWNER.value == "OWNER"
    assert OrganizationRole.ADMIN.value == "ADMIN"
    assert OrganizationRole.MEMBER.value == "MEMBER"
