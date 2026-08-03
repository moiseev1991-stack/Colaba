"""add timeweb email provider + daily_limit column

Revision ID: 054
Revises: 053
Create Date: 2026-08-03

Две независимые правки схемы email-провайдеров:

1. Колонка ``daily_limit INTEGER NULL`` в ``email_provider_config`` —
   дневной лимит отправок для прогрева новых доменов. NULL = без лимита
   (postbox/ses/hyvor). Проверяется в outreach/tasks._send_one_email:
   считаем успешные строки api_call_log за текущие сутки и сравниваем.
   Применяется только в массовой KP-рассылке, не влияет на ручные тесты
   админом.

2. Строка-инициализация для нового SMTP-провайдера ``timeweb`` —
   классический SMTP на домене spinlid-team.ru (smtp.timeweb.ru:465 SSL).
   В отличие от postbox/ses — авторизация по email+паролю, не по API-ключам.
   Креды (smtp_user/smtp_password) НЕ зашиваются в миграцию — вносятся
   админом через UI после деплоя. По умолчанию is_enabled=false (включается
   вручную после заполнения кредов и теста подключения).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "054"
down_revision: Union[str, None] = "053"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) Колонка daily_limit — для всех провайдеров (NULL у существующих).
    op.add_column(
        "email_provider_config",
        sa.Column("daily_limit", sa.Integer(), nullable=True),
    )

    # 2) Строка-инициализация для timeweb. SMTP-поля кроме кредов заданы
    #    сразу (хост/порт/SSL/from по умолчанию); креды вносит админ.
    op.execute(
        """
        INSERT INTO email_provider_config
            (provider_id, transport, is_enabled, is_configured, priority,
             cost_per_mail, smtp_host, smtp_port, smtp_use_ssl, from_email,
             daily_limit, created_at, updated_at)
        VALUES
            ('timeweb', 'smtp', false, false, 3,
             0, 'smtp.timeweb.ru', 465, true, 'dmitry@spinlid-team.ru',
             12, now(), now())
        ON CONFLICT (provider_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM email_provider_config WHERE provider_id = 'timeweb'")
    op.drop_column("email_provider_config", "daily_limit")
