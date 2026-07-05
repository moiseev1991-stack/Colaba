"""add map_provider_config table

Revision ID: 042
Revises: 041
Create Date: 2026-07-02

Создаёт singleton-таблицу настроек провайдеров карт/отзывов:
2GIS, Yandex Maps, Google Maps. Аналог email_config (миграция 013),
но одна строка на провайдер (unique provider_id).

Сразу вставляет 3 дефолтные строки с is_enabled=false — UI показывает
их сразу, ключи пустые (читаются из env через fallback в провайдерах).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from datetime import datetime


revision: str = "042"
down_revision: Union[str, None] = "041"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "map_provider_config",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("provider_id", sa.String(length=32), nullable=False),
        sa.Column("api_key", sa.String(length=255), nullable=True),
        sa.Column("secondary_key", sa.String(length=255), nullable=True),
        sa.Column(
            "is_enabled",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
        sa.Column(
            "is_configured",
            sa.Boolean(),
            nullable=False,
            server_default="false",
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
        sa.UniqueConstraint("provider_id", name="uq_map_provider_config_provider_id"),
    )
    op.create_index(
        op.f("ix_map_provider_config_id"),
        "map_provider_config",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_map_provider_config_provider_id"),
        "map_provider_config",
        ["provider_id"],
        unique=True,
    )

    # Дефолтные строки — UI сразу видит все 3 провайдера.
    for pid in ("twogis", "yandex_maps", "google_maps"):
        op.execute(
            f"""
            INSERT INTO map_provider_config
                (provider_id, api_key, secondary_key, is_enabled, is_configured, updated_at, created_at)
            VALUES ('{pid}', NULL, NULL, false, false, NOW(), NOW())
            """
        )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_map_provider_config_provider_id"),
        table_name="map_provider_config",
    )
    op.drop_index(op.f("ix_map_provider_config_id"), table_name="map_provider_config")
    op.drop_table("map_provider_config")
