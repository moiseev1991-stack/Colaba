"""add search_provider_config table

Revision ID: 004
Revises: 003
Create Date: 2026-01-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "search_provider_config",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("provider_id", sa.String(length=64), nullable=False),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_search_provider_config_id", "search_provider_config", ["id"], unique=False)
    op.create_index("ix_search_provider_config_provider_id", "search_provider_config", ["provider_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_search_provider_config_provider_id", table_name="search_provider_config")
    op.drop_index("ix_search_provider_config_id", table_name="search_provider_config")
    op.drop_table("search_provider_config")
