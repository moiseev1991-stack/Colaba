"""company_decision_makers — таблица ЛПР (директора, маркетологи, владельцы)

Revision ID: 032
Revises: 031
Create Date: 2026-06-06

ЧАСТЬ A.2 ТЗ 2026-06-04. Одна компания → много ЛПР (по одному на лицо).
Источник:
- 'dadata' — ФИО руководителя из DaData (уже есть в company_legal.director_name,
  не дублируем сюда — этот источник остаётся first-class в LegalBlock);
- 'website_team' / 'website_about' / 'website_contacts' — LLM-извлечение
  имён+должностей с соответствующих страниц сайта компании.

confidence (0..1): 0.95 для DaData, 0.7 для уверенных LLM-извлечений
(чёткая страница «команда» с именами и должностями), 0.4 — фолбэк для
имён без должности.

is_decision_maker (bool): True если post-keyword попадает в whitelist
ролей «директор/руководитель/владелец/основатель/маркетолог/управляющий/CEO/CMO».
False — для сотрудников ниже (например «менеджер по продажам»).

Уникальность: (company_id, lower(name)) — чтобы тот же ФИО не задвоился
если он попался и на /team, и на /about.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "032"
down_revision = "031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "company_decision_makers",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "company_id",
            sa.BigInteger(),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("post", sa.String(200), nullable=True),
        # 'website_team' | 'website_about' | 'website_contacts'
        sa.Column("source", sa.String(40), nullable=False),
        # URL страницы с которой ФИО было извлечено — для аудита и UI-tooltip.
        sa.Column("source_url", sa.String(1000), nullable=True),
        sa.Column("confidence", sa.Numeric(3, 2), nullable=False, server_default="0.5"),
        sa.Column(
            "is_decision_maker",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index(
        "ix_company_decision_makers_company_id",
        "company_decision_makers",
        ["company_id"],
    )
    # SQL прямо: уникальность по (company_id, lower(name)) на стороне БД,
    # чтобы дедуп работал даже если код забыл вызвать .lower() перед insert.
    op.execute(
        "CREATE UNIQUE INDEX uq_company_decision_makers_company_lname "
        "ON company_decision_makers (company_id, lower(name))"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_company_decision_makers_company_lname")
    op.drop_index(
        "ix_company_decision_makers_company_id",
        table_name="company_decision_makers",
    )
    op.drop_table("company_decision_makers")
