"""Поднять is_superuser=True для sir.nikam@example.com — единственный
доступ в админку website-leads на старте.

Revision ID: 041
Revises: 040
Create Date: 2026-06-23

Юзер хотел видеть заявки с публичных landing'ов в админке. У нас нет
отдельной роли admin — есть `users.is_superuser` boolean. Поднимаем
флаг для аккаунта владельца. UPDATE безопасен: если юзера нет в БД
(локальный dev, чистая инсталляция) — миграция не падает, просто
ничего не обновит.
"""

from alembic import op


revision = "041"
down_revision = "040"
branch_labels = None
depends_on = None


ADMIN_EMAIL = "sir.nikam@example.com"


def upgrade() -> None:
    op.execute(
        f"UPDATE users SET is_superuser = TRUE "
        f"WHERE LOWER(email) = '{ADMIN_EMAIL.lower()}'"
    )


def downgrade() -> None:
    op.execute(
        f"UPDATE users SET is_superuser = FALSE "
        f"WHERE LOWER(email) = '{ADMIN_EMAIL.lower()}'"
    )
