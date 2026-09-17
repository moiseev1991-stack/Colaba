"""Интеграционные тесты платежного флоу с ЭМУЛЯЦИЕЙ ЮKassa (2026-09-17).

Мокаем HTTP-слой YooKassa (create_payment/get_payment) и проходим весь путь:
создание платежа → webhook payment.succeeded → сверка через «API» →
активация подписки + грант кредитов → идемпотентность повторного webhook.

Плюс enforcement: charge_or_402 при CREDITS_ENABLED=True (списание и 402).
"""

from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base
from app.models.billing import CreditBucket, CreditTransaction, Payment, Subscription
from app.models.user import User
from app.modules.billing import service as credits
from app.modules.billing.enforcement import charge_or_402
from app.modules.payments import service as yookassa
from app.modules.payments.router import _maybe_grant


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite://")
    tables = [
        User.__table__,
        CreditBucket.__table__,
        CreditTransaction.__table__,
        Subscription.__table__,
        Payment.__table__,
    ]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        session.add(User(email="pay@t.ru", hashed_password="x", is_active=True))
        await session.flush()
        yield session
    await engine.dispose()


USER = 1


def _remote(status: str = "succeeded", amount: str = "990.00"):
    """Мок async service.get_payment: возвращает корутину с ответом API ЮKassa."""

    async def _fake(payment_id: str) -> dict:
        return {
            "id": payment_id,
            "status": status,
            "paid": status == "succeeded",
            "amount": {"value": amount, "currency": "RUB"},
            "metadata": {"plan": "starter", "uid": str(USER)},
        }

    return _fake


async def _create_pending_payment(db: AsyncSession) -> Payment:
    row = Payment(
        user_id=USER,
        provider="yookassa",
        provider_payment_id="emu-001",
        tariff_code="starter",
        amount_rub=990,
        credits=500,
        status="pending",
    )
    db.add(row)
    await db.commit()
    return row


async def test_full_payment_flow_grants_subscription_and_credits(db, monkeypatch):
    """Эмуляция: платёж pending → webhook (API говорит succeeded) → грант."""
    await _create_pending_payment(db)

    # ЮKassa API «подтверждает» платёж
    monkeypatch.setattr(yookassa, "get_payment", _remote())

    row = await _maybe_grant(db, "emu-001")

    assert row.granted is True
    assert row.status == "succeeded"

    sub = await credits.get_active_subscription(db, USER)
    assert sub is not None and sub.tariff_code == "starter"
    # Баланс: приветственных нет, только подписка
    assert await credits.get_balance(db, USER) == 500
    # Подписочные кредиты истекают в конце периода
    bucket = (await db.execute(select(CreditBucket))).scalar_one()
    assert bucket.expires_at is not None


async def test_webhook_idempotent_no_double_grant(db, monkeypatch):
    """Повторный webhook (ЮKassa ретраит) не начисляет дважды."""
    await _create_pending_payment(db)
    monkeypatch.setattr(yookassa, "get_payment", _remote())

    await _maybe_grant(db, "emu-001")
    await _maybe_grant(db, "emu-001")  # повтор
    await _maybe_grant(db, "emu-001")  # и ещё

    balance = await credits.get_balance(db, USER)
    grants = (await db.execute(select(CreditTransaction).where(CreditTransaction.type == "grant"))).scalars().all()
    assert balance == 500  # не 1500
    assert len(grants) == 1


async def test_webhook_wrong_amount_no_grant(db, monkeypatch):
    """Сумма в API (89₽) меньше оплаченного тарифа (990₽) — гранта нет."""
    await _create_pending_payment(db)
    monkeypatch.setattr(yookassa, "get_payment", _remote(amount="89.00"))

    row = await _maybe_grant(db, "emu-001")
    assert row.granted is False
    assert await credits.get_balance(db, USER) == 0
    assert await credits.get_active_subscription(db, USER) is None


async def test_webhook_pending_status_no_grant(db, monkeypatch):
    monkeypatch.setattr(yookassa, "get_payment", _remote(status="pending_for_capture"))
    await _create_pending_payment(db)
    row = await _maybe_grant(db, "emu-001")
    assert row.granted is False


async def test_unknown_payment_id_ignored(db, monkeypatch):
    monkeypatch.setattr(yookassa, "get_payment", _remote())
    row = await _maybe_grant(db, "does-not-exist")
    assert row is None


async def test_charge_and_402(db, monkeypatch):
    """Enforcement: списание при включённом флаге; нехватка → 402 с расшифровкой."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "CREDITS_ENABLED", True, raising=False)
    await credits.grant_credits(db, USER, 15, "welcome")
    await db.commit()

    # Хватает: поиск 10 → остаток 5
    await charge_or_402(db, USER, "map_search")
    assert await credits.get_balance(db, USER) == 5

    # Не хватает: поиск снова 10 → 402
    with pytest.raises(HTTPException) as e:
        await charge_or_402(db, USER, "map_search")
    assert e.value.status_code == 402
    detail = e.value.detail
    assert detail["code"] == "insufficient_credits"
    assert detail["required"] == 10 and detail["balance"] == 5 and detail["missing"] == 5
    assert detail["topup_url"] == "/app/billing"


async def test_charge_disabled_in_beta(db, monkeypatch):
    """CREDITS_ENABLED=False — бесплатный проход (бета)."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "CREDITS_ENABLED", False, raising=False)
    result = await charge_or_402(db, USER, "map_search")
    assert result is None
    assert await credits.get_balance(db, USER) == 0
