"""Тесты кредитного ядра: FIFO-списание, экспайр, 402, идемпотентность гранта.

Запуск: PYTHONPATH=. pytest tests/test_billing_credits.py -q
Использует sqlite aiosqlite (как остальные тесты репо).
"""

import pytest
import pytest_asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.core.database import Base
from app.models.billing import CreditBucket, CreditTransaction, Subscription, Payment
from app.models.user import User
from app.modules.billing import service as credits
from app.modules.billing.service import InsufficientCreditsError
from app.modules.billing.tariffs import TARIFFS, OPERATIONS_PRICES, tariffs_payload


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite://")
    billing_tables = [
        User.__table__,  # FK-цель; без JSONB-колонок
        CreditBucket.__table__,
        CreditTransaction.__table__,
        Subscription.__table__,
        Payment.__table__,
    ]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=billing_tables)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        session.add(User(email="t@t.ru", hashed_password="x", is_active=True))
        await session.flush()
        yield session
    await engine.dispose()


USER = 1


async def test_grant_and_balance(db: AsyncSession):
    await credits.grant_credits(db, USER, 100, "welcome")
    await db.commit()
    assert await credits.get_balance(db, USER) == 100


async def test_spend_fifo_expiring_first(db: AsyncSession):
    """Списание идёт сначала из истекающего бакета (подписка), потом из вечного."""
    soon = datetime.now(timezone.utc) + timedelta(days=1)
    await credits.grant_credits(db, USER, 30, "subscription", expires_at=soon)
    await credits.grant_credits(db, USER, 100, "topup")  # без экспайра
    await credits.spend_credits(db, USER, "map_search")  # 10
    await db.commit()

    buckets = (await db.execute(select(CreditBucket).order_by(CreditBucket.id))).scalars().all()
    assert buckets[0].amount_spent == 10  # подписочный истекающий — первым
    assert buckets[1].amount_spent == 0
    assert await credits.get_balance(db, USER) == 120


async def test_spend_insufficient_402_data(db: AsyncSession):
    await credits.grant_credits(db, USER, 5, "welcome")
    with pytest.raises(InsufficientCreditsError) as e:
        await credits.spend_credits(db, USER, "map_search")
    assert e.value.missing == 5
    assert e.value.required == 10


async def test_expired_bucket_not_counted(db: AsyncSession):
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    await credits.grant_credits(db, USER, 50, "subscription", expires_at=past)
    await db.commit()
    assert await credits.get_balance(db, USER) == 0


async def test_ledger_rows(db: AsyncSession):
    await credits.grant_credits(db, USER, 100, "welcome")
    await credits.spend_credits(db, USER, "kp_generate", ref_type="company", ref_id=7)
    await db.commit()
    txs = (await db.execute(select(CreditTransaction).order_by(CreditTransaction.id))).scalars().all()
    assert [t.type for t in txs] == ["grant", "spend"]
    assert txs[0].amount == 100 and txs[0].balance_after == 100
    assert txs[1].amount == -2 and txs[1].balance_after == 98
    assert txs[1].operation == "kp_generate"


async def test_activate_subscription_grants_and_closes_old(db: AsyncSession):
    await credits.activate_subscription(db, USER, "starter")
    await db.commit()
    sub2 = await credits.activate_subscription(db, USER, "business")
    await db.commit()
    subs = (await db.execute(select(Subscription).where(Subscription.user_id == USER))).scalars().all()
    active = [s for s in subs if s.status == "active"]
    assert len(active) == 1 and active[0].tariff_code == "business"
    # Баланс: подписочные кредиты обоих грантов (новый период не сжигает
    # старые принудительно — старый бакет истёкнет по своему expires_at)
    assert await credits.get_balance(db, USER) == TARIFFS["starter"].credits + TARIFFS["business"].credits


async def test_refund(db: AsyncSession):
    await credits.grant_credits(db, USER, 100, "welcome")
    await credits.spend_credits(db, USER, "map_search")
    await db.commit()
    assert await credits.get_balance(db, USER) == 90
    await credits.refund_credits(db, USER, "map_search", 10, ref_type="map_search", ref_id=5)
    await db.commit()
    assert await credits.get_balance(db, USER) == 100
    last = (await db.execute(select(CreditTransaction).order_by(CreditTransaction.id.desc()).limit(1))).scalar_one()
    assert last.type == "refund" and last.amount == 10


def test_tariffs_math():
    """Экономика: рубль за кредит убывает с тарифом, поиск = 10 кредитов."""
    payload = {p["code"]: p for p in tariffs_payload()}
    assert payload["starter"]["rub_per_credit"] == 1.98
    assert payload["business"]["rub_per_credit"] == 1.5
    assert payload["pro"]["rub_per_credit"] > 1.3
    assert payload["starter"]["searches"] == 50
    assert OPERATIONS_PRICES["map_search"] == 10
