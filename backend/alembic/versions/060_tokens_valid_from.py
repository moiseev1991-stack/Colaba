"""tokens_valid_from: отзыв всех сессий юзера (смена пароля / logout everywhere / удаление).

Revision ID: 060_tokens_valid_from
Revises: 059_auth_security
"""

from alembic import op
import sqlalchemy as sa

revision = "060_tokens_valid_from"
down_revision = "059"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    return bool(
        bind.execute(
            sa.text("SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = :c"),
            {"t": table, "c": column},
        ).scalar()
    )


def upgrade() -> None:
    if not _column_exists("users", "tokens_valid_from"):
        op.add_column(
            "users",
            sa.Column("tokens_valid_from", sa.DateTime(), nullable=True),
        )


def downgrade() -> None:
    if _column_exists("users", "tokens_valid_from"):
        op.drop_column("users", "tokens_valid_from")
