"""marketing DM finder — расширение company_decision_makers + hiring flag

Revision ID: 049
Revises: 048
Create Date: 2026-07-09

ТЗ 2026-06-20 «Маркетинг-ЛПР Finder».

company_decision_makers — расширяем существующую таблицу (миграция 032):
- role_category — enum-подобный String: marketing/owner/founder/management/hr/other.
  Позволяет одним запросом найти всех маркетологов, всех учредителей и т.п.
- is_marketing_dm — целевой ЛПР по маркетингу (маркетолог/CMO ИЛИ фолбэк на
  учредителя/директора, если маркетолога не найдено).
- contact_type / contact_value — публичный рабочий канал персоны
  (vk/email/phone/site). NULL если известны только ФИО+роль.
- egrn_matches_founder — заготовка под сверку ЕГРН↔учредитель. NULL пока
  ЕГРН-источник не подключён.

Заметно: source-множество расширяем — раньше был только website_*, теперь
добавляем 'vk' | 'hh' | 'egrul_director' | 'egrul_founder' | 'egrn'.
Значения хранятся строкой (не enum), чтобы можно было добавлять источники
без миграций.

companies — двa поля-сигнала «ищет маркетолога» (для hh.ru):
- hiring_marketing (bool default false) — есть ли активная вакансия маркетолога;
- hiring_url (String 1000) — ссылка на вакансию для ручной проверки.
Индекс по hiring_marketing для быстрой фильтрации в выдаче.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "049"
down_revision: Union[str, None] = "048"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- company_decision_makers: новые поля ---
    op.add_column(
        "company_decision_makers",
        sa.Column("role_category", sa.String(20), nullable=True),
    )
    op.add_column(
        "company_decision_makers",
        sa.Column(
            "is_marketing_dm",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "company_decision_makers",
        sa.Column("contact_type", sa.String(20), nullable=True),
    )
    op.add_column(
        "company_decision_makers",
        sa.Column("contact_value", sa.String(500), nullable=True),
    )
    op.add_column(
        "company_decision_makers",
        sa.Column("egrn_matches_founder", sa.Boolean(), nullable=True),
    )

    # Индекс под фильтр «Ищет маркетолога» и подъём маркетинг-ЛПР в drawer.
    op.create_index(
        "ix_company_decision_makers_marketing_dm",
        "company_decision_makers",
        ["company_id", "is_marketing_dm"],
    )
    op.create_index(
        "ix_company_decision_makers_role_category",
        "company_decision_makers",
        ["role_category"],
    )

    # --- companies: сигнал «ищет маркетолога» (hh.ru) ---
    op.add_column(
        "companies",
        sa.Column(
            "hiring_marketing",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "companies",
        sa.Column("hiring_url", sa.String(1000), nullable=True),
    )
    op.create_index(
        "ix_companies_hiring_marketing",
        "companies",
        ["hiring_marketing"],
        postgresql_where=sa.text("hiring_marketing = true"),
    )


def downgrade() -> None:
    op.drop_index("ix_companies_hiring_marketing", table_name="companies")
    op.drop_column("companies", "hiring_url")
    op.drop_column("companies", "hiring_marketing")

    op.drop_index(
        "ix_company_decision_makers_role_category",
        table_name="company_decision_makers",
    )
    op.drop_index(
        "ix_company_decision_makers_marketing_dm",
        table_name="company_decision_makers",
    )
    op.drop_column("company_decision_makers", "egrn_matches_founder")
    op.drop_column("company_decision_makers", "contact_value")
    op.drop_column("company_decision_makers", "contact_type")
    op.drop_column("company_decision_makers", "is_marketing_dm")
    op.drop_column("company_decision_makers", "role_category")
