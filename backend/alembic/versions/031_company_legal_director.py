"""company_legal: ФИО руководителя + должность + учредители (ЛПР, ТЗ A.1 2026-06-04)

Revision ID: 031
Revises: 030
Create Date: 2026-06-06

ЧАСТЬ A ТЗ 2026-06-04: контакты ЛПР. DaData /suggest/party отдаёт
`data.management.name` (например «ИВАНОВ ИВАН ИВАНОВИЧ») и
`data.management.post` («ГЕНЕРАЛЬНЫЙ ДИРЕКТОР»). Сохраняем эти поля
прямо в company_legal — по ним:
1) подставляем имя в обращение outreach-письма
   («Здравствуйте, Иван!» вместо «Здравствуйте!»);
2) показываем «ЛПР: Иванов И.И., директор» в drawer карточки;
3) добавляем колонки в Excel-экспорт лидов на сайт.

founders_json (массив data.founders) кэшируем на будущее — пока не
используем, но при следующем DaData-обогащении не дёргать повторно.

Все поля nullable: на free-тарифе DaData management у ИП может быть
пустым (там ФИО = ФИО предпринимателя из legal_name).
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "031"
down_revision = "030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "company_legal",
        sa.Column("director_name", sa.String(200), nullable=True),
    )
    op.add_column(
        "company_legal",
        sa.Column("director_post", sa.String(200), nullable=True),
    )
    op.add_column(
        "company_legal",
        sa.Column("founders_json", JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("company_legal", "founders_json")
    op.drop_column("company_legal", "director_post")
    op.drop_column("company_legal", "director_name")
