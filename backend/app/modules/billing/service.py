"""Сервис кредитов: баланс, атомарное списание FIFO, гранты, экспайр.

Инварианты:
- Все мутации в одной транзакции сессии вызывающего (spend/grant сами
  НЕ коммитят — коммит на стороне роутера/задачи, кроме grant_welcome
  при регистрации).
- Ledger append-only: balance_after считается из суммы бакетов на момент
  операции (не хранится на юзере отдельной колонкой — источник правды
  бакеты, ledger для истории).
- FIFO: списание сначала из бакетов с ближайшим expires_at (NULL — в
  последнюю очередь), в рамках одного expires_at — старые раньше.
"""

import logging
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import CreditBucket, CreditTransaction, Subscription
from app.modules.billing.tariffs import (
    SUBSCRIPTION_PERIOD_DAYS,
    TARIFFS,
    get_tariff,
)

logger = logging.getLogger(__name__)


def _aware(dt: datetime) -> datetime:
    """sqlite (тесты) возвращает naive datetime — считаем его UTC."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _is_expired(expires_at: Optional[datetime], now: datetime) -> bool:
    return expires_at is not None and _aware(expires_at) <= now


class InsufficientCreditsError(Exception):
    """Недостаточно кредитов: 402 + сколько не хватает и куда идти."""

    def __init__(self, required: int, balance: int, operation: str):
        self.required = required
        self.balance = balance
        self.operation = operation
        self.missing = required - balance
        super().__init__(
            f"Недостаточно кредитов: нужно {required}, доступно {balance} "
            f"(не хватает {self.missing}) для операции «{operation}»"
        )


async def _active_buckets(db: AsyncSession, user_id: int) -> List[CreditBucket]:
    """Активные бакеты юзера, отсортированные FIFO (истекающие раньше)."""
    now = datetime.now(timezone.utc)
    res = await db.execute(
        select(CreditBucket)
        .where(
            CreditBucket.user_id == user_id,
            CreditBucket.amount_granted > CreditBucket.amount_spent,
        )
        .order_by(CreditBucket.expires_at.asc().nullslast(), CreditBucket.id.asc())
    )
    buckets = list(res.scalars().all())
    return [b for b in buckets if not _is_expired(b.expires_at, now)]


async def get_balance(db: AsyncSession, user_id: int) -> int:
    buckets = await _active_buckets(db, user_id)
    return sum(b.remaining for b in buckets)


async def _ledger(
    db: AsyncSession,
    user_id: int,
    tx_type: str,
    amount: int,
    balance_after: int,
    operation: Optional[str] = None,
    ref_type: Optional[str] = None,
    ref_id: Optional[int] = None,
    tariff_code: Optional[str] = None,
    payment_id: Optional[int] = None,
    comment: Optional[str] = None,
) -> None:
    db.add(
        CreditTransaction(
            user_id=user_id,
            type=tx_type,  # type: ignore[arg-type]
            amount=amount,
            balance_after=balance_after,
            operation=operation,
            ref_type=ref_type,
            ref_id=ref_id,
            tariff_code=tariff_code,
            payment_id=payment_id,
            comment=comment,
        )
    )


async def grant_credits(
    db: AsyncSession,
    user_id: int,
    amount: int,
    source: str,
    tariff_code: Optional[str] = None,
    payment_id: Optional[int] = None,
    expires_at: Optional[datetime] = None,
    comment: Optional[str] = None,
) -> int:
    """Начислить кредиты (подписка/докупка/админ/приветственные). Возвращает новый баланс."""
    if amount <= 0:
        raise ValueError("amount must be positive")
    bucket = CreditBucket(
        user_id=user_id,
        source=source,  # type: ignore[arg-type]
        amount_granted=amount,
        amount_spent=0,
        expires_at=expires_at,
        tariff_code=tariff_code,
        payment_id=payment_id,
        comment=comment,
    )
    db.add(bucket)
    await db.flush()
    balance = await get_balance(db, user_id)
    await _ledger(
        db,
        user_id,
        "grant",
        amount,
        balance,
        operation=source,
        ref_type="bucket",
        ref_id=bucket.id,
        tariff_code=tariff_code,
        payment_id=payment_id,
        comment=comment,
    )
    return balance


async def spend_credits(
    db: AsyncSession,
    user_id: int,
    operation: str,
    amount: Optional[int] = None,
    ref_type: Optional[str] = None,
    ref_id: Optional[int] = None,
) -> int:
    """Списать кредиты FIFO. Кидает InsufficientCreditsError (→ 402).

    Вызывать ДО запуска тяжёлой операции; при её провале — refund_credits.
    """
    from app.modules.billing.tariffs import OPERATIONS_PRICES

    if amount is None:
        amount = OPERATIONS_PRICES.get(operation, 0)
    if amount <= 0:
        return await get_balance(db, user_id)

    buckets = await _active_buckets(db, user_id)
    balance = sum(b.remaining for b in buckets)
    if balance < amount:
        from app.modules.billing.tariffs import OPERATION_LABELS

        raise InsufficientCreditsError(
            required=amount,
            balance=balance,
            operation=OPERATION_LABELS.get(operation, operation),
        )

    left = amount
    for b in buckets:
        if left <= 0:
            break
        take = min(b.remaining, left)
        b.amount_spent += take
        left -= take
    await db.flush()

    balance_after = await get_balance(db, user_id)
    await _ledger(
        db,
        user_id,
        "spend",
        -amount,
        balance_after,
        operation=operation,
        ref_type=ref_type,
        ref_id=ref_id,
    )
    return balance_after


async def refund_credits(
    db: AsyncSession,
    user_id: int,
    operation: str,
    amount: int,
    ref_type: Optional[str] = None,
    ref_id: Optional[int] = None,
    comment: Optional[str] = None,
) -> int:
    """Возврат кредитов (операция провалилась после списания)."""
    balance = await grant_credits(
        db, user_id, amount, "admin", comment=f"refund:{operation}" + (f" {comment}" if comment else "")
    )
    # помечаем ledger-строку как refund для читаемой истории
    tx = (
        await db.execute(
            select(CreditTransaction)
            .where(CreditTransaction.user_id == user_id)
            .order_by(CreditTransaction.id.desc())
            .limit(1)
        )
    ).scalar_one()
    tx.type = "refund"  # type: ignore[assignment]
    tx.operation = operation
    tx.ref_type = ref_type
    tx.ref_id = ref_id
    return balance


async def list_transactions(
    db: AsyncSession,
    user_id: int,
    limit: int = 50,
    offset: int = 0,
) -> Tuple[List[CreditTransaction], int]:
    from sqlalchemy import func

    total = (
        await db.execute(
            select(func.count()).select_from(CreditTransaction).where(CreditTransaction.user_id == user_id)
        )
    ).scalar_one()
    res = await db.execute(
        select(CreditTransaction)
        .where(CreditTransaction.user_id == user_id)
        .order_by(CreditTransaction.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(res.scalars().all()), total


async def get_active_subscription(db: AsyncSession, user_id: int) -> Optional[Subscription]:
    # naive UTC для совместимости со sqlite-тестами (postgres хранит aware)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    res = await db.execute(
        select(Subscription)
        .where(
            Subscription.user_id == user_id,
            Subscription.status == "active",
            Subscription.period_end > now,
        )
        .order_by(Subscription.period_end.desc())
        .limit(1)
    )
    return res.scalar_one_or_none()


async def activate_subscription(
    db: AsyncSession, user_id: int, tariff_code: str, payment_id: Optional[int] = None
) -> Subscription:
    # naive-UTC везде в биллинге: postgres DateTime(timezone=True) честно
    # вернёт aware, но sqlite-тесты — naive; единый формат упрощает сравнение
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    """Активация после успешной оплаты: закрывает прежние подписки, создаёт
    новую на 30 дней и начисляет подписочные кредиты (сгорают в конце периода)."""
    tariff = get_tariff(tariff_code)
    if not tariff:
        raise ValueError(f"Unknown tariff: {tariff_code}")

    # Прежние активные — закрываем (правило z.ai: одна подписка, без автосмены)
    await db.execute(
        update(Subscription)
        .where(Subscription.user_id == user_id, Subscription.status == "active")
        .values(status="expired")
    )

    from datetime import timedelta

    period_end = now + timedelta(days=SUBSCRIPTION_PERIOD_DAYS)
    sub = Subscription(
        user_id=user_id,
        tariff_code=tariff_code,
        status="active",
        period_start=now,
        period_end=period_end,
        auto_renew=True,
        payment_id=payment_id,
    )
    db.add(sub)
    await db.flush()

    await grant_credits(
        db,
        user_id,
        tariff.credits,
        "subscription",
        tariff_code=tariff_code,
        payment_id=payment_id,
        expires_at=period_end,
        comment=f"Подписка «{tariff.name}»",
    )
    logger.info("Subscription activated: user=%s tariff=%s credits=%s", user_id, tariff_code, tariff.credits)
    return sub


async def expire_stale_subscriptions(db: AsyncSession) -> int:
    """Ежедневная задача: подписки с истёкшим периодом → expired.
    Остатки подписочных бакетов становятся неактивными автоматически
    (expires_at = period_end); ledger-строку expire не пишем — балансовые
    запросы уже не видят истёкшее."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    res = await db.execute(
        update(Subscription)
        .where(Subscription.status == "active", Subscription.period_end <= now)
        .values(status="expired")
    )
    await db.commit()
    return res.rowcount or 0


async def grant_welcome_credits(db: AsyncSession, user_id: int) -> None:
    """Приветственные кредиты при регистрации — попробовать продукт."""
    from app.modules.billing.tariffs import WELCOME_CREDITS

    await grant_credits(
        db,
        user_id,
        WELCOME_CREDITS,
        "welcome",
        comment="Приветственные кредиты",
    )
    await db.commit()
