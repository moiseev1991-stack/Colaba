"""add email_provider_config table

Revision ID: 045
Revises: 044
Create Date: 2026-07-05

Создаёт singleton-per-provider таблицу настроек 3 каналов отправки email:
postbox (основной), ses (резервный), hyvor (собственный сервер).

Аналог map_provider_config (миграция 042). Заменяет бинарный выбор
EmailConfig.provider_type {'hyvor','smtp'} на fallback-цепочку с
приоритетами. Старая таблица email_config НЕ удаляется — она остаётся
для IMAP/подписи/DNS-записей.

Сразу вставляет 3 дефолтные строки с is_enabled=false и значениями
priority/cost_per_mail из реестра providers_registry.py:
- postbox: priority=0, cost=0.039
- ses:     priority=1, cost=0.009
- hyvor:   priority=2, cost=0.0
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "045"
down_revision: Union[str, None] = "044"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "email_provider_config",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("provider_id", sa.String(length=32), nullable=False),
        sa.Column("api_key", sa.String(length=255), nullable=True),
        sa.Column("secret_key", sa.String(length=255), nullable=True),
        sa.Column("smtp_host", sa.String(length=255), nullable=True),
        sa.Column("smtp_port", sa.Integer(), nullable=True),
        sa.Column("smtp_user", sa.String(length=255), nullable=True),
        sa.Column("smtp_password", sa.String(length=255), nullable=True),
        sa.Column(
            "smtp_use_ssl",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("from_email", sa.String(length=255), nullable=True),
        sa.Column("from_name", sa.String(length=255), nullable=True),
        sa.Column("region", sa.String(length=50), nullable=True),
        sa.Column(
            "cost_per_mail",
            sa.Numeric(precision=10, scale=6),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "is_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "is_configured",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "priority",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column("last_test_at", sa.DateTime(), nullable=True),
        sa.Column("last_test_result", sa.String(length=50), nullable=True),
        sa.Column("last_test_error", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider_id", name="uq_email_provider_config_provider_id"),
    )
    op.create_index(
        op.f("ix_email_provider_config_id"),
        "email_provider_config",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_email_provider_config_provider_id"),
        "email_provider_config",
        ["provider_id"],
        unique=True,
    )

    # Дефолтные строки — UI сразу видит все 3 провайдера.
    defaults = [
        ("postbox", 0, "0.039"),
        ("ses", 1, "0.009"),
        ("hyvor", 2, "0.000000"),
    ]
    for provider_id, priority, cost in defaults:
        op.execute(
            f"""
            INSERT INTO email_provider_config
                (provider_id, is_enabled, is_configured, priority,
                 cost_per_mail, updated_at, created_at)
            VALUES ('{provider_id}', false, false, {priority},
                    '{cost}', NOW(), NOW())
            """
        )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_email_provider_config_provider_id"),
        table_name="email_provider_config",
    )
    op.drop_index(
        op.f("ix_email_provider_config_id"),
        table_name="email_provider_config",
    )
    op.drop_table("email_provider_config")
