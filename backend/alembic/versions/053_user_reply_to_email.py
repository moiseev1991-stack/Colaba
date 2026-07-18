"""users.reply_to_email — email для ответов в outreach-рассылках

Revision ID: 053
Revises: 052
Create Date: 2026-07-18

Reply-To архитектура для cold-outreach: письма лидам отправляются от
системного верифицированного домена (From), а при нажатии «Ответить»
ответ уходит на личный ящик пользователя (Reply-To).

Колонка nullable — старые аккаунты без значения блокируются при попытке
отправить email-рассылку (с подсказкой заполнить профиль). Значение может
отличаться от login-email: пользователь входит как user@spinlid.ru, а
ответы хочет получать на client@gmail.com.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "053"
down_revision: Union[str, None] = "052"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("reply_to_email", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "reply_to_email")
