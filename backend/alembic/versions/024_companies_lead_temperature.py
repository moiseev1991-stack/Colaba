"""companies.lead_temperature — кэш скоринга «температуры лида» 0-100

Revision ID: 024
Revises: 023
Create Date: 2026-06-02

Блок 3 ТЗ 2026-06-02. Скор 0-100 на существующих полях карточки
(рейтинг / отзывы / контакты / свежесть). Кэшируем в колонку, чтобы
сортировка `temperature_desc` была дешёвой и индексируемой.

Колонка nullable — у компаний, для которых пересчёт ещё не прогонялся,
будет NULL. При выдаче сортируем `NULLS LAST`, чтобы такие не всплывали
наверх.

Индекс desc для основного use-case «горячие первыми». NULLS LAST в
индексе по умолчанию для ASC — а нам нужен DESC, поэтому явно
указываем «DESC NULLS LAST».
"""

from alembic import op
import sqlalchemy as sa


revision = "024"
down_revision = "023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "companies",
        sa.Column("lead_temperature", sa.SmallInteger(), nullable=True),
    )
    # SQL прямо — выражение `DESC NULLS LAST` в индексе не всегда красиво
    # эмиттится через sa.text() в create_index. Делаем raw, чтобы наверняка.
    op.execute(
        "CREATE INDEX ix_companies_lead_temperature_desc "
        "ON companies (lead_temperature DESC NULLS LAST)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_companies_lead_temperature_desc")
    op.drop_column("companies", "lead_temperature")
