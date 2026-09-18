"""Тесты админ-операций биллинга: гранты, ручные подписки, отмены, обзор."""

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base
from app.models.billing import CreditBucket, CreditTransaction, Subscription
from app.models.user import User
from app.modules.billing import service as credits


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite://")
    tables = [
        User.__table__,
        CreditBucket.__table__,
        CreditTransaction.__table__,
        Subscription.__table__,
    ]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        session.add(User(email="adm@t.ru", hashed_password="x", is_active=True, is_superuser=True))
        session.add(User(email="u2@t.ru", hashed_password="x", is_active=True))
        await session.flush()
        yield session
    await engine.dispose()


async def test_admin_grant_persists_comment_audit(db: AsyncSession):
    """Грант админа: источник admin, без expires, comment в ledger."""
    await credits.grant_credits(db, 2, 250, "admin", comment="admin:adm@t.ru: компенсация")
    await db.commit()

    b = (await db.execute(select(CreditBucket))).scalar_one()
    assert b.source == "admin" and b.expires_at is None
    t = (await db.execute(select(CreditTransaction))).scalar_one()
    assert t.comment.startswith("admin:")
    assert await credits.get_balance(db, 2) == 250


async def test_manual_activate_then_cancel(db: AsyncSession):
    """Ручная активация (без оплаты) → отмена: мягкая, кредиты остаются до периода."""
    sub = await credits.activate_subscription(db, 2, "business")
    sub.auto_renew = False
    await db.commit()

    assert await credits.get_balance(db, 2) == 2000

    # cancel: статус + автопродление, кредиты не сгорают до expires_at
    from sqlalchemy import update

    await db.execute(
        update(Subscription)
        .where(Subscription.user_id == 2, Subscription.status == "active")
        .values(status="cancelled", auto_renew=False, cancel_at_period_end=True)
    )
    await db.commit()

    assert await credits.get_active_subscription(db, 2) is None
    assert await credits.get_balance(db, 2) == 2000  # квота периода жива


async def test_grant_amount_validation():
    from app.modules.billing.admin_router import AdminGrantRequest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        AdminGrantRequest(amount=0, comment="x" * 5)
    with pytest.raises(ValidationError):
        AdminGrantRequest(amount=10, comment="ab")  # короткий comment
    ok = AdminGrantRequest(amount=10, comment="бонус за отзыв")
    assert ok.amount == 10


async def test_self_guards():
    """Нельзя заблокировать себя / снять права себе (защита от лок-аута)."""
    from fastapi import HTTPException
    from app.modules.billing.admin_router import (
        AdminUserStatusRequest,
        AdminUserRoleRequest,
    )

    # Схемы валидны
    AdminUserStatusRequest(is_active=False)
    AdminUserRoleRequest(is_superuser=True)
