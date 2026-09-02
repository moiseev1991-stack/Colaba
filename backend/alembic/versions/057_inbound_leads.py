"""inbound_leads — единый приёмник заявок (Telegram-бот + форма лендинга)

Revision ID: 057
Revises: 056
Create Date: 2026-09-01

Новая таблица inbound_leads под ТЗ «холодная рассылка автоматизация клиентов»:
заявки на бесплатный разбор от бота-приёмника (source='tg_bot') и формы
лендинга spinlid-team.ru (source='landing_form'). Матчинг company_text с
companies через matched_company_id (SET NULL при удалении компании).
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "057"
down_revision = "056"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "inbound_leads",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("source_tag", sa.String(120), nullable=False, server_default=""),
        sa.Column("tg_user_id", sa.BigInteger(), nullable=True),
        sa.Column("tg_username", sa.String(64), nullable=True),
        sa.Column("name", sa.String(255), nullable=False, server_default=""),
        sa.Column("company_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("contact_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("raw_messages", JSONB(), nullable=False, server_default="[]"),
        sa.Column("status", sa.String(20), nullable=False, server_default="new"),
        sa.Column("owner_notified", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "matched_company_id",
            sa.BigInteger(),
            sa.ForeignKey("companies.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_inbound_leads_created_at", "inbound_leads", ["created_at"])
    op.create_index("ix_inbound_leads_status", "inbound_leads", ["status"])
    op.create_index("ix_inbound_leads_tg_user_id", "inbound_leads", ["tg_user_id"])
    op.create_index("ix_inbound_leads_matched_company_id", "inbound_leads", ["matched_company_id"])


def downgrade() -> None:
    op.drop_index("ix_inbound_leads_matched_company_id", table_name="inbound_leads")
    op.drop_index("ix_inbound_leads_tg_user_id", table_name="inbound_leads")
    op.drop_index("ix_inbound_leads_status", table_name="inbound_leads")
    op.drop_index("ix_inbound_leads_created_at", table_name="inbound_leads")
    op.drop_table("inbound_leads")
