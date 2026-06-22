"""website_leads — заявки с публичных SEO-лендингов

Revision ID: 040
Revises: 039
Create Date: 2026-06-23

На spinlid.ru приходит SEO-трафик на страницы-заглушки (парсер 2gis,
парсер яндекс карт, анализ отзывов). Раньше посетители ничего не могли
сделать, кроме как закрыть вкладку. С этой миграции на каждой landing-
странице есть форма захвата: имя + канал связи (email/phone/whatsapp/
telegram/max) + контакт + (опц.) пожелание.

Все заявки складываются в одну таблицу. Админ (`is_superuser`) видит
их в `/app/admin/website-leads`. Анонимный POST на `/api/v1/website-leads/submit`
без auth, защищён rate-limit'ом по IP + honeypot-полем в форме.
"""

from alembic import op
import sqlalchemy as sa


revision = "040"
down_revision = "039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "website_leads",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False, server_default=""),
        # email / phone / whatsapp / telegram / max
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("contact", sa.String(255), nullable=False),
        sa.Column("wish", sa.Text(), nullable=False, server_default=""),
        sa.Column("source_page", sa.String(500), nullable=False, server_default=""),
        sa.Column("referrer", sa.String(500), nullable=False, server_default=""),
        sa.Column("ip", sa.String(64), nullable=False, server_default=""),
        sa.Column("user_agent", sa.String(500), nullable=False, server_default=""),
        # new / contacted / qualified / spam
        sa.Column(
            "status", sa.String(20), nullable=False, server_default="new"
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=False), nullable=True),
    )
    op.create_index(
        "ix_website_leads_created_at", "website_leads", ["created_at"]
    )
    op.create_index("ix_website_leads_status", "website_leads", ["status"])


def downgrade() -> None:
    op.drop_index("ix_website_leads_status", table_name="website_leads")
    op.drop_index("ix_website_leads_created_at", table_name="website_leads")
    op.drop_table("website_leads")
