"""kp_generation_jobs.options — JSONB для новых параметров bulk-КП

Revision ID: 050
Revises: 049
Create Date: 2026-07-12

ТЗ 2026-07-12 «Bulk-КП по общей боли».

Раньше bulk-джоба хранила только template_key / tone / custom_sender_profile.
Теперь добавляем поле options (JSONB, nullable) — универсальный контейнер
для остальных параметров генерации, чтобы не плодить колонки под каждый
новый флаг.

Что там будет:
    pain_tag_ids: list[int] | None      # общая боль партии
    use_4hods: bool                     # включить каркас «4 хода»
    channel: 'messenger' | 'email'      # только при use_4hods=True
    my_offer_step: str | None           # ХОД4 микрошаг

Задача Celery-task'а — читает job.options и пробрасывает в generate_kp.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "050"
down_revision: Union[str, None] = "049"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "kp_generation_jobs",
        sa.Column("options", JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("kp_generation_jobs", "options")
