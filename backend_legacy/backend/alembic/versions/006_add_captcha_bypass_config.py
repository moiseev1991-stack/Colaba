"""add captcha_bypass_config table

Revision ID: 006
Revises: 005
Create Date: 2026-01-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "captcha_bypass_config",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("ai_assistant_id", sa.Integer(), nullable=True),
        sa.Column("external_services", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["ai_assistant_id"], ["ai_assistant.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_captcha_bypass_config_id", "captcha_bypass_config", ["id"], unique=False)
    op.create_index("ix_captcha_bypass_config_ai_assistant_id", "captcha_bypass_config", ["ai_assistant_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_captcha_bypass_config_ai_assistant_id", table_name="captcha_bypass_config")
    op.drop_index("ix_captcha_bypass_config_id", table_name="captcha_bypass_config")
    op.drop_table("captcha_bypass_config")
