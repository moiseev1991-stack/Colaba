"""widen email_provider_config credential columns to 2048

Revision ID: 047
Revises: 046
Create Date: 2026-07-06

Колонки api_key/secret_key/smtp_password/smtp_user/smtp_host/from_email
в email_provider_config были String(255). На практике встречаются ключи
длиннее 255 (например, JWT-токены IAM, длинные base64-секреты). При
попытке сохранить такой — БД падает с StringDataRightTruncationError и
пользователь видит «непредвиденную ошибку» (HTTP 500).

Решение: widen до 2048 (хватит для любого ключа). Для паролей делаем
Text (без лимита) — там бывают arbitrary blobs.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "047"
down_revision: Union[str, None] = "046"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Секреты/пароли — Text (без лимита длины).
    op.alter_column(
        "email_provider_config", "api_key",
        type_=sa.Text(), existing_type=sa.String(length=255),
        nullable=True,
    )
    op.alter_column(
        "email_provider_config", "secret_key",
        type_=sa.Text(), existing_type=sa.String(length=255),
        nullable=True,
    )
    op.alter_column(
        "email_provider_config", "smtp_password",
        type_=sa.Text(), existing_type=sa.String(length=255),
        nullable=True,
    )
    # Прочие строки — widen до 2048 (хосты, emails, имена, регионы).
    for col in ("smtp_host", "smtp_user", "from_email", "from_name", "region"):
        op.alter_column(
            "email_provider_config", col,
            type_=sa.String(length=2048), existing_type=sa.String(length=255),
            nullable=True,
        )


def downgrade() -> None:
    # Возврат к 255 — небезопасен (потеряем данные), но для консистентности.
    for col in ("smtp_host", "smtp_user", "from_email", "from_name", "region"):
        op.alter_column(
            "email_provider_config", col,
            type_=sa.String(length=255), existing_type=sa.String(length=2048),
            nullable=True,
        )
    op.alter_column(
        "email_provider_config", "smtp_password",
        type_=sa.String(length=255), existing_type=sa.Text(),
        nullable=True,
    )
    op.alter_column(
        "email_provider_config", "secret_key",
        type_=sa.String(length=255), existing_type=sa.Text(),
        nullable=True,
    )
    op.alter_column(
        "email_provider_config", "api_key",
        type_=sa.String(length=255), existing_type=sa.Text(),
        nullable=True,
    )
