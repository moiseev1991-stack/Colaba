"""add user_outreach_templates table

Revision ID: 043
Revises: 042
Create Date: 2026-07-05

Создаёт таблицу пользовательских шаблонов outreach-писем.

Контекст: фронт-сервис outreachTemplates.ts стучался в несуществующий
роут /outreach/templates и работал через localStorage-фолбэк — все
«сохранённые шаблоны» пользователя жили только в браузере и терялись
при очистке. Эта таблица + роутер /outreach/templates (CRUD) делают их
персистентными.

Поля соответствуют фронт-контракту OutreachTemplate:
    { id, name, subject, body, module, is_default, created_at, updated_at }

UniqueConstraint(user_id, name) — имя шаблона уникально у пользователя.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "043"
down_revision: Union[str, None] = "042"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_outreach_templates",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("subject", sa.String(length=500), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "module",
            sa.String(length=50),
            nullable=False,
            server_default="seo",
        ),
        sa.Column(
            "is_default",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "name", name="uq_user_outreach_tpl_user_name"
        ),
    )
    op.create_index(
        op.f("ix_user_outreach_templates_user_id"),
        "user_outreach_templates",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_user_outreach_templates_user_id"),
        table_name="user_outreach_templates",
    )
    op.drop_table("user_outreach_templates")
