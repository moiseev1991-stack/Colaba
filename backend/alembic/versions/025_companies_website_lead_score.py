"""companies.website_lead_score — кэш скоринга «лида на сайт» 0-100

Revision ID: 025
Revises: 024
Create Date: 2026-06-02

Блок 4 ТЗ 2026-06-02. Отдельный профиль скоринга (от lead_temperature):
здесь главная цель — продажа создания сайта. Бизнес-логика:
- нет сайта (или псевдо-сайт типа vk.com/2gis-карточка) → базовое условие
- активная карточка (свежие отзывы / отвечает владелец) → большой вес
- рейтинг ≥4.0 + много отзывов + есть телефон → подъём
- штрафы за «мёртвую» карточку и низкий рейтинг

NULL для компаний с активным собственным сайтом — они не website-лиды.
В сортировке `website_score_desc` уходят в конец (NULLS LAST).
"""

from alembic import op
import sqlalchemy as sa


revision = "025"
down_revision = "024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "companies",
        sa.Column("website_lead_score", sa.SmallInteger(), nullable=True),
    )
    op.execute(
        "CREATE INDEX ix_companies_website_lead_score_desc "
        "ON companies (website_lead_score DESC NULLS LAST)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_companies_website_lead_score_desc")
    op.drop_column("companies", "website_lead_score")
