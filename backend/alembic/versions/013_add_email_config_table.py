"""add email_config singleton table

Revision ID: 013
Revises: 012
Create Date: 2026-04-21

"""

from alembic import op
import sqlalchemy as sa


revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "email_config",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("provider_type", sa.String(20), nullable=False, server_default="smtp"),
        sa.Column("hyvor_api_url", sa.String(255), nullable=True),
        sa.Column("hyvor_api_key", sa.String(255), nullable=True),
        sa.Column("hyvor_webhook_secret", sa.String(255), nullable=True),
        sa.Column("smtp_host", sa.String(255), nullable=True),
        sa.Column("smtp_port", sa.Integer(), nullable=True),
        sa.Column("smtp_user", sa.String(255), nullable=True),
        sa.Column("smtp_password", sa.String(255), nullable=True),
        sa.Column("smtp_use_ssl", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("smtp_from_email", sa.String(255), nullable=True),
        sa.Column("smtp_from_name", sa.String(255), nullable=True),
        sa.Column("reply_to_email", sa.String(255), nullable=True),
        sa.Column("imap_host", sa.String(255), nullable=True),
        sa.Column("imap_port", sa.Integer(), nullable=True),
        sa.Column("imap_user", sa.String(255), nullable=True),
        sa.Column("imap_password", sa.String(255), nullable=True),
        sa.Column("imap_use_ssl", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("imap_mailbox", sa.String(255), nullable=False, server_default="INBOX"),
        sa.Column("reply_prefix", sa.String(50), nullable=False, server_default="reply-"),
        sa.Column("is_configured", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("last_test_at", sa.DateTime(), nullable=True),
        sa.Column("last_test_result", sa.String(50), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute(
        """
        INSERT INTO email_config (id, provider_type, hyvor_api_url, smtp_port, smtp_use_ssl, imap_port, imap_use_ssl, reply_prefix, is_configured)
        VALUES (1, 'smtp', 'http://hyvor-relay:8000', 465, true, 993, true, 'reply-', false)
        """
    )


def downgrade() -> None:
    op.drop_table("email_config")
