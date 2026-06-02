"""company_legal — юр.данные из DaData (Блок 2 ТЗ 2026-06-02)

Revision ID: 027
Revises: 026
Create Date: 2026-06-02

Отдельная таблица (не колонки в companies) — чтобы не раздувать main-таблицу
и иметь чистый аудит обогащения: матч confidence, источник (dadata/fns/manual),
raw_json для отладки.

Уникальность по company_id — одна запись на компанию. Если матч не найден,
всё равно создаём запись с status='not_found' чтобы не дёргать DaData
повторно при каждой попытке.
"""

from alembic import op
import sqlalchemy as sa


revision = "027"
down_revision = "026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "company_legal",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "company_id",
            sa.BigInteger(),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        # Идентификация юр.лица.
        sa.Column("inn", sa.String(12), nullable=True, index=True),
        sa.Column("ogrn", sa.String(20), nullable=True),
        sa.Column("kpp", sa.String(12), nullable=True),
        sa.Column("legal_name", sa.String(500), nullable=True),
        sa.Column("legal_short_name", sa.String(300), nullable=True),
        # Метрики бизнеса.
        sa.Column("registration_date", sa.Date(), nullable=True),
        sa.Column(
            "revenue",
            sa.Numeric(14, 2),
            nullable=True,
            comment="Годовой оборот в рублях (последний доступный год)",
        ),
        sa.Column("employee_count", sa.Integer(), nullable=True),
        # active / liquidating / liquidated / reorganizing / not_found
        sa.Column("legal_status", sa.String(20), nullable=True),
        sa.Column("okved", sa.String(20), nullable=True),
        sa.Column("okved_name", sa.String(300), nullable=True),
        # Матчинг.
        sa.Column(
            "match_confidence",
            sa.Numeric(3, 2),
            nullable=True,
            comment="0..1, насколько уверенно сматчили; NULL если not_found",
        ),
        sa.Column(
            "matched_by",
            sa.String(20),
            nullable=True,
            comment="phone | name_address | inn | manual",
        ),
        sa.Column(
            "source",
            sa.String(20),
            nullable=False,
            server_default="dadata",
            comment="dadata | fns | manual",
        ),
        # Полный ответ для отладки/будущих доработок.
        sa.Column(
            "raw_json",
            sa.dialects.postgresql.JSONB(),
            nullable=True,
        ),
        # Статус: 'ok' (есть данные), 'not_found' (искали, не нашли),
        # 'error' (DaData упала). Чтобы не дёргать повторно для not_found.
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="ok",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    # Индексы для частых фильтров.
    op.create_index(
        "ix_company_legal_revenue",
        "company_legal",
        ["revenue"],
    )
    op.create_index(
        "ix_company_legal_registration_date",
        "company_legal",
        ["registration_date"],
    )


def downgrade() -> None:
    op.drop_index("ix_company_legal_registration_date", table_name="company_legal")
    op.drop_index("ix_company_legal_revenue", table_name="company_legal")
    op.drop_table("company_legal")
