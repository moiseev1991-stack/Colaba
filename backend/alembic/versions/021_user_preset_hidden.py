"""user_filter_presets.hidden — флаг «скрытый пресет»

Revision ID: 021
Revises: 020
Create Date: 2026-05-30

Юзер может скрыть свой пресет, чтобы он не отображался в основной
панели, но не удалять окончательно — скрытые видны на отдельной вкладке
«Скрытые», откуда можно вернуть. Удобно для «сезонных» пресетов
(например, «Новогодние подарки в декабре») и для накопления библиотеки
без захламления.

Default false — все существующие пресеты остаются активными.
"""

from alembic import op
import sqlalchemy as sa


revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_filter_presets",
        sa.Column(
            "hidden",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("user_filter_presets", "hidden")
