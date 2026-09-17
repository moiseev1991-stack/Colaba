"""Модели биллинга: кредиты (тарификация 2026-09, docs/guides/BILLING_CREDITS.md).

Архитектура — «кошелёк с грантами» (лучшие практики Lago/Anthropic, правила
z.ai devpack адаптированы под РФ/ЮKassa):

- CreditBucket   — грант кредитов (подписка на период / докупка / админ /
                   приветственные). Остаток = granted - spent. Подписочные
                   гранты истекают в конце периода (expires_at), докупка не
                   сгорает (expires_at NULL).
- CreditTransaction — append-only ledger (double-entry дух: каждая операция
                   = строка с балансом после). Типы: grant/spend/refund/expire.
- Subscription   — подписка на тариф: период, автопродление, отмена к концу
                   периода (правило z.ai: смена/отмена — вручную, действует
                   до конца оплаченного цикла).
- Payment        — платёж ЮKassa, персистентно (раньше не сохранялся и
                   webhook не мог ничего начислить).
"""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import relationship

from app.core.database import Base

# sqlite (тесты/CI) не автоинкрементит BIGINT PK — вариант для тестов
BigIntPK = BigInteger().with_variant(Integer, "sqlite")


class CreditBucket(Base):
    """Грант кредитов. Списание идёт FIFO: сначала истекающие ближайшие."""

    __tablename__ = "credit_buckets"
    __table_args__ = (Index("ix_credit_buckets_user_active", "user_id", "expires_at"),)

    id = Column(BigIntPK, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    source = Column(
        Enum("subscription", "topup", "admin", "welcome", name="credit_source"),
        nullable=False,
    )
    amount_granted = Column(Integer, nullable=False)
    amount_spent = Column(Integer, nullable=False, default=0, server_default="0")
    """NULL — не сгорает (докупка/админ). Подписка: конец периода (UTC)."""
    expires_at = Column(DateTime(timezone=True), nullable=True)
    tariff_code = Column(String(32), nullable=True)
    payment_id = Column(BigInteger, nullable=True, index=True)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    @property
    def remaining(self) -> int:
        return max(self.amount_granted - self.amount_spent, 0)


class CreditTransaction(Base):
    """Ledger: append-only история начислений/списаний (для ЛК и аудита)."""

    __tablename__ = "credit_transactions"
    __table_args__ = (Index("ix_credit_transactions_user_created", "user_id", "created_at"),)

    id = Column(BigIntPK, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(
        Enum("grant", "spend", "refund", "expire", name="credit_tx_type"),
        nullable=False,
    )
    """Кредиты со знаком: grant=+, spend=-, refund=+, expire=-."""
    amount = Column(Integer, nullable=False)
    balance_after = Column(Integer, nullable=False)
    operation = Column(String(32), nullable=True)
    """Что породило: map_search / kp_generate / payment:42 / welcome…"""
    ref_type = Column(String(32), nullable=True)
    ref_id = Column(BigInteger, nullable=True)
    tariff_code = Column(String(32), nullable=True)
    payment_id = Column(BigInteger, nullable=True)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Subscription(Base):
    """Подписка на тариф (правила z.ai: действует до конца периода, смена —
    вручную; unused value не переносится — квота периода)."""

    __tablename__ = "subscriptions"

    id = Column(BigIntPK, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    tariff_code = Column(String(32), nullable=False)
    status = Column(
        Enum("active", "expired", "cancelled", name="subscription_status"),
        nullable=False,
        default="active",
    )
    period_start = Column(DateTime(timezone=True), nullable=False)
    period_end = Column(DateTime(timezone=True), nullable=False, index=True)
    """Отмена к концу периода (z.ai: авто-смена тарифа не происходит)."""
    auto_renew = Column(Boolean, nullable=False, default=True)
    cancel_at_period_end = Column(Boolean, nullable=False, default=False)
    payment_id = Column(BigInteger, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Payment(Base):
    """Платёж ЮKassa. Webhook сверяет статус через API и начисляет кредиты."""

    __tablename__ = "payments"
    __table_args__ = (Index("uq_payments_provider_payment", "provider", "provider_payment_id", unique=True),)

    id = Column(BigIntPK, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    provider = Column(String(32), nullable=False, default="yookassa")
    provider_payment_id = Column(String(128), nullable=True)
    tariff_code = Column(String(32), nullable=False)
    amount_rub = Column(Integer, nullable=False)
    credits = Column(Integer, nullable=False)
    status = Column(
        Enum("pending", "succeeded", "cancelled", name="payment_status"),
        nullable=False,
        default="pending",
    )
    """Начислены ли кредиты/подписка (идемпотентность webhook+polling)."""
    granted = Column(Boolean, nullable=False, default=False)
    raw = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    subscription = relationship(
        "Subscription", uselist=False, primaryjoin="foreign(Subscription.payment_id) == Payment.id"
    )
