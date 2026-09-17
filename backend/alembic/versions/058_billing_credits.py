"""billing: кредиты, подписки, платежи (тарификация 2026-09)

Revision ID: 058
Revises: 057
Create Date: 2026-09-17

Модели: CreditBucket (гранты, FIFO-списание), CreditTransaction (ledger),
Subscription (тариф на период), Payment (ЮKassa, персистентно).
См. docs/guides/BILLING_CREDITS.md — экономика и правила.
"""

from alembic import op
import sqlalchemy as sa

revision = "058"
down_revision = "057"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "credit_buckets",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "source",
            sa.Enum("subscription", "topup", "admin", "welcome", name="credit_source"),
            nullable=False,
        ),
        sa.Column("amount_granted", sa.Integer(), nullable=False),
        sa.Column("amount_spent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("tariff_code", sa.String(32), nullable=True),
        sa.Column("payment_id", sa.BigInteger(), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_credit_buckets_user_id", "credit_buckets", ["user_id"])
    op.create_index("ix_credit_buckets_user_active", "credit_buckets", ["user_id", "expires_at"])
    op.create_index("ix_credit_buckets_payment_id", "credit_buckets", ["payment_id"])

    op.create_table(
        "credit_transactions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "type",
            sa.Enum("grant", "spend", "refund", "expire", name="credit_tx_type"),
            nullable=False,
        ),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("balance_after", sa.Integer(), nullable=False),
        sa.Column("operation", sa.String(32), nullable=True),
        sa.Column("ref_type", sa.String(32), nullable=True),
        sa.Column("ref_id", sa.BigInteger(), nullable=True),
        sa.Column("tariff_code", sa.String(32), nullable=True),
        sa.Column("payment_id", sa.BigInteger(), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_credit_transactions_user_id", "credit_transactions", ["user_id"])
    op.create_index("ix_credit_transactions_user_created", "credit_transactions", ["user_id", "created_at"])

    op.create_table(
        "subscriptions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tariff_code", sa.String(32), nullable=False),
        sa.Column(
            "status",
            sa.Enum("active", "expired", "cancelled", name="subscription_status"),
            nullable=False,
        ),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("auto_renew", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("cancel_at_period_end", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("payment_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_subscriptions_user_id", "subscriptions", ["user_id"])
    op.create_index("ix_subscriptions_period_end", "subscriptions", ["period_end"])

    op.create_table(
        "payments",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("provider", sa.String(32), nullable=False, server_default="yookassa"),
        sa.Column("provider_payment_id", sa.String(128), nullable=True),
        sa.Column("tariff_code", sa.String(32), nullable=False),
        sa.Column("amount_rub", sa.Integer(), nullable=False),
        sa.Column("credits", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "succeeded", "cancelled", name="payment_status"),
            nullable=False,
        ),
        sa.Column("granted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("raw", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_payments_user_id", "payments", ["user_id"])
    op.create_index("uq_payments_provider_payment", "payments", ["provider", "provider_payment_id"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_payments_provider_payment", table_name="payments")
    op.drop_index("ix_payments_user_id", table_name="payments")
    op.drop_table("payments")
    op.drop_index("ix_subscriptions_period_end", table_name="subscriptions")
    op.drop_index("ix_subscriptions_user_id", table_name="subscriptions")
    op.drop_table("subscriptions")
    op.drop_index("ix_credit_transactions_user_created", table_name="credit_transactions")
    op.drop_index("ix_credit_transactions_user_id", table_name="credit_transactions")
    op.drop_table("credit_transactions")
    op.drop_index("ix_credit_buckets_payment_id", table_name="credit_buckets")
    op.drop_index("ix_credit_buckets_user_active", table_name="credit_buckets")
    op.drop_index("ix_credit_buckets_user_id", table_name="credit_buckets")
    op.drop_table("credit_buckets")
    sa.Enum(name="payment_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="subscription_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="credit_tx_type").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="credit_source").drop(op.get_bind(), checkfirst=True)
