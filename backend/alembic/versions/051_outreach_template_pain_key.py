"""user_outreach_templates.pain_key — привязка шаблона к боли

Revision ID: 051
Revises: 050
Create Date: 2026-07-14

Юзер на /app/pains выбирает боль → предлагаются подходящие шаблоны.
Шаблон может быть либо привязан к конкретной pain_key (напр. call_no_answer),
либо универсальный (pain_key=NULL). Универсальные показываются всегда.

Значения pain_key — из PAIN_KEYS в app/modules/outreach/pain_dictionaries.py:
    call_no_answer, callback_lost, schedule_hard, schedule_wait, queue_wait,
    admin_rude, food_slow, unclear_pricing.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "051"
down_revision: Union[str, None] = "050"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_outreach_templates",
        sa.Column("pain_key", sa.String(64), nullable=True),
    )
    op.create_index(
        "ix_user_outreach_tpl_pain_key",
        "user_outreach_templates",
        ["pain_key"],
    )


def downgrade() -> None:
    op.drop_index("ix_user_outreach_tpl_pain_key", table_name="user_outreach_templates")
    op.drop_column("user_outreach_templates", "pain_key")
