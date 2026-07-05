"""add channel_config + telegram_subscribers

Revision ID: 046
Revises: 045
Create Date: 2026-07-05

Создаёт:
1. channel_config — singleton-per-channel таблицу настроек каналов
   рассылки помимо email (telegram / whatsapp / max). Конфиги в JSONB,
   разные схемы под разные каналы.
2. telegram_subscribers — реестр пользователей Telegram, нажавших /start
   на нашем боте. Связь с компанией по phone/email для проставления
   chat_id в КП-конвейере.

Сразу вставляет 3 дефолтные строки channel_config с enabled=false.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "046"
down_revision: Union[str, None] = "045"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── channel_config ───────────────────────────────────────────────
    op.create_table(
        "channel_config",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("channel_id", sa.String(length=32), nullable=False),
        sa.Column("config", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column(
            "enabled",
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
        sa.UniqueConstraint("channel_id", name="uq_channel_config_channel_id"),
    )
    op.create_index(
        op.f("ix_channel_config_id"),
        "channel_config",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_channel_config_channel_id"),
        "channel_config",
        ["channel_id"],
        unique=True,
    )

    # Дефолтные строки — UI сразу видит все 3 канала.
    defaults = [
        ("telegram", {"bot_token": "", "bot_username": "", "welcome_message": "", "cost_per_message": 0}),
        ("whatsapp", {"api_url": "https://api.green-api.com", "instance_id": "", "api_token": "", "cost_per_message": 0}),
        ("max", {"status": "coming_soon", "cost_per_message": 0}),
    ]
    for channel_id, cfg in defaults:
        # JSONB через literal — простой способ без сложных bind params.
        import json
        cfg_json = json.dumps(cfg).replace("'", "''")
        op.execute(
            f"""
            INSERT INTO channel_config
                (channel_id, config, enabled, is_configured, updated_at, created_at)
            VALUES ('{channel_id}', '{cfg_json}'::jsonb, false, false, NOW(), NOW())
            """
        )

    # ── telegram_subscribers ─────────────────────────────────────────
    op.create_table(
        "telegram_subscribers",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("chat_id", sa.BigInteger(), nullable=False),
        sa.Column("username", sa.String(length=64), nullable=True),
        sa.Column("first_name", sa.String(length=128), nullable=True),
        sa.Column("phone", sa.String(length=20), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("last_interaction_at", sa.DateTime(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("chat_id", name="uq_telegram_subscribers_chat_id"),
    )
    op.create_index(
        op.f("ix_telegram_subscribers_id"),
        "telegram_subscribers",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_telegram_subscribers_chat_id"),
        "telegram_subscribers",
        ["chat_id"],
        unique=True,
    )
    op.create_index(
        op.f("ix_telegram_subscribers_phone"),
        "telegram_subscribers",
        ["phone"],
        unique=False,
    )
    op.create_index(
        op.f("ix_telegram_subscribers_email"),
        "telegram_subscribers",
        ["email"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_telegram_subscribers_email"), table_name="telegram_subscribers")
    op.drop_index(op.f("ix_telegram_subscribers_phone"), table_name="telegram_subscribers")
    op.drop_index(op.f("ix_telegram_subscribers_chat_id"), table_name="telegram_subscribers")
    op.drop_index(op.f("ix_telegram_subscribers_id"), table_name="telegram_subscribers")
    op.drop_table("telegram_subscribers")
    op.drop_index(op.f("ix_channel_config_channel_id"), table_name="channel_config")
    op.drop_index(op.f("ix_channel_config_id"), table_name="channel_config")
    op.drop_table("channel_config")
