"""add transport column to email_provider_config

Revision ID: 048
Revises: 047
Create Date: 2026-07-07

Колонка transport ('smtp' | 'http') — способ отправки писем:
- 'smtp' — классическое SMTP-соединение (порт 587/465). Дефолт.
- 'http' — AWS SESv2 HTTP API через boto3 (порт 443).

'http' решает проблему VPS-хостингов, блокирующих исходящие SMTP-порты
(25/465/587) — Postbox и SES поддерживают HTTP-API на 443, который не
блокируется. Для postbox на заблокированном VPS — рекомендуется 'http'.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "048"
down_revision: Union[str, None] = "047"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "email_provider_config",
        sa.Column(
            "transport",
            sa.String(length=10),
            nullable=False,
            server_default="smtp",
        ),
    )
    # Для postbox на проде (где SMTP-порта нет) по умолчанию включаем http.
    # На dev-стенде со свободными портами можно переключить обратно в UI.
    op.execute(
        "UPDATE email_provider_config SET transport='http' "
        "WHERE provider_id='postbox'"
    )


def downgrade() -> None:
    op.drop_column("email_provider_config", "transport")
