"""reviews.owner_reply_text — сохраняем текст ответа владельца

Revision ID: 052
Revises: 051
Create Date: 2026-07-16

Юзер (Дима, 16.07): «Комментарии владельца на отзывы (owner_reply) —
иногда подпись "— Мария, PR-менеджер". Парсим regex'ом».

Раньше провайдеры (google_maps, twogis, yandex_maps) заполняли только
has_owner_reply=True, а текст ответа терялся. Теперь сохраняем raw_text
ответа — новый модуль owner_reply_dm.py извлекает из него подписи
(«— Мария, PR-менеджер», «С уважением, Иван Петров»).

Текст может быть длинным (владельцы иногда пишут развёрнутые ответы),
но обычно 100-500 символов — Text-столбец без ограничения.

Индекс на raw_text_purged_at позволит cron'у периодически чистить
старые тексты, если места станет мало (аналог reviews.raw_text_purged_at).
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "052"
down_revision: Union[str, None] = "051"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "reviews",
        sa.Column("owner_reply_text", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("reviews", "owner_reply_text")
