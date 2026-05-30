"""user_filter_presets: пользовательские сохранённые наборы фильтров

Revision ID: 020
Revises: 019
Create Date: 2026-05-30

Юзер настраивает фильтры на странице результатов поиска по картам
(рейтинг / отзывы / слова / сайт / сортировка) и сохраняет под именем.
В строке пресетов рядом со встроенными «Кризис», «Стабильный» и т.д.
появляется его кнопка. Можно удалить — встроенные удалить нельзя,
они в коде.

Поле filter — JSONB с MapSearchFilter (только заполненные значения,
exclude_none при сериализации).

Поле module — заранее закладываем расширение на другие модули
(searches, tenders), сейчас всегда 'maps'.

UniqueConstraint(user_id, name, module) — нельзя дубли имён в рамках
одного модуля у одного юзера.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_filter_presets",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "organization_id",
            sa.Integer(),
            sa.ForeignKey("organizations.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("module", sa.String(20), nullable=False, server_default="maps"),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("filter", JSONB(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.UniqueConstraint(
            "user_id", "module", "name",
            name="uq_user_filter_presets_user_module_name",
        ),
    )
    op.create_index(
        "ix_user_filter_presets_user_module",
        "user_filter_presets",
        ["user_id", "module"],
    )


def downgrade() -> None:
    op.drop_index("ix_user_filter_presets_user_module", table_name="user_filter_presets")
    op.drop_table("user_filter_presets")
