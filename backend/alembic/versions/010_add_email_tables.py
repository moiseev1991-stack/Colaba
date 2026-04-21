"""Add email tables for outreach campaigns

Revision ID: 010
Revises: 009
Create Date: 2026-03-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '010'
down_revision: Union[str, None] = '009'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create email_domains table
    op.create_table(
        'email_domains',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('organization_id', sa.Integer(), nullable=True),
        sa.Column('domain', sa.String(255), nullable=False),
        sa.Column('dkim_status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('spf_status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('dmarc_status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('dkim_record', sa.Text(), nullable=True),
        sa.Column('spf_record', sa.Text(), nullable=True),
        sa.Column('dmarc_record', sa.Text(), nullable=True),
        sa.Column('default_from_email', sa.String(255), nullable=True),
        sa.Column('default_from_name', sa.String(255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('verified_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('domain')
    )
    op.create_index(op.f('ix_email_domains_id'), 'email_domains', ['id'], unique=False)
    op.create_index(op.f('ix_email_domains_organization_id'), 'email_domains', ['organization_id'], unique=False)

    # Create email_templates table
    op.create_table(
        'email_templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('organization_id', sa.Integer(), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('subject', sa.String(500), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('module', sa.String(50), nullable=False, server_default='seo'),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('variables', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_email_templates_id'), 'email_templates', ['id'], unique=False)
    op.create_index(op.f('ix_email_templates_organization_id'), 'email_templates', ['organization_id'], unique=False)
    op.create_index(op.f('ix_email_templates_user_id'), 'email_templates', ['user_id'], unique=False)

    # Create email_campaigns table
    op.create_table(
        'email_campaigns',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('organization_id', sa.Integer(), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('template_id', sa.Integer(), nullable=True),
        sa.Column('domain_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('subject', sa.String(500), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='draft'),
        sa.Column('total_recipients', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('sent_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('delivered_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('opened_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('clicked_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('bounced_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('spam_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('failed_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('search_result_ids', sa.JSON(), nullable=True),
        sa.Column('from_email', sa.String(255), nullable=True),
        sa.Column('from_name', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['template_id'], ['email_templates.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['domain_id'], ['email_domains.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_email_campaigns_id'), 'email_campaigns', ['id'], unique=False)
    op.create_index(op.f('ix_email_campaigns_organization_id'), 'email_campaigns', ['organization_id'], unique=False)
    op.create_index(op.f('ix_email_campaigns_user_id'), 'email_campaigns', ['user_id'], unique=False)
    op.create_index(op.f('ix_email_campaigns_template_id'), 'email_campaigns', ['template_id'], unique=False)
    op.create_index(op.f('ix_email_campaigns_domain_id'), 'email_campaigns', ['domain_id'], unique=False)

    # Create email_logs table
    op.create_table(
        'email_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('campaign_id', sa.Integer(), nullable=True),
        sa.Column('search_result_id', sa.Integer(), nullable=True),
        sa.Column('organization_id', sa.Integer(), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('to_email', sa.String(255), nullable=False),
        sa.Column('to_name', sa.String(255), nullable=True),
        sa.Column('subject', sa.String(500), nullable=False),
        sa.Column('body_preview', sa.Text(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('external_message_id', sa.String(255), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('error_code', sa.String(50), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('sent_at', sa.DateTime(), nullable=True),
        sa.Column('delivered_at', sa.DateTime(), nullable=True),
        sa.Column('opened_at', sa.DateTime(), nullable=True),
        sa.Column('clicked_at', sa.DateTime(), nullable=True),
        sa.Column('bounced_at', sa.DateTime(), nullable=True),
        sa.Column('extra_data', sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(['campaign_id'], ['email_campaigns.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['search_result_id'], ['search_results.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_email_logs_id'), 'email_logs', ['id'], unique=False)
    op.create_index(op.f('ix_email_logs_campaign_id'), 'email_logs', ['campaign_id'], unique=False)
    op.create_index(op.f('ix_email_logs_search_result_id'), 'email_logs', ['search_result_id'], unique=False)
    op.create_index(op.f('ix_email_logs_organization_id'), 'email_logs', ['organization_id'], unique=False)
    op.create_index(op.f('ix_email_logs_user_id'), 'email_logs', ['user_id'], unique=False)
    op.create_index(op.f('ix_email_logs_to_email'), 'email_logs', ['to_email'], unique=False)
    op.create_index(op.f('ix_email_logs_status'), 'email_logs', ['status'], unique=False)
    op.create_index(op.f('ix_email_logs_external_message_id'), 'email_logs', ['external_message_id'], unique=False)


def downgrade() -> None:
    # Drop email_logs table
    op.drop_index(op.f('ix_email_logs_external_message_id'), table_name='email_logs')
    op.drop_index(op.f('ix_email_logs_status'), table_name='email_logs')
    op.drop_index(op.f('ix_email_logs_to_email'), table_name='email_logs')
    op.drop_index(op.f('ix_email_logs_user_id'), table_name='email_logs')
    op.drop_index(op.f('ix_email_logs_organization_id'), table_name='email_logs')
    op.drop_index(op.f('ix_email_logs_search_result_id'), table_name='email_logs')
    op.drop_index(op.f('ix_email_logs_campaign_id'), table_name='email_logs')
    op.drop_index(op.f('ix_email_logs_id'), table_name='email_logs')
    op.drop_table('email_logs')

    # Drop email_campaigns table
    op.drop_index(op.f('ix_email_campaigns_domain_id'), table_name='email_campaigns')
    op.drop_index(op.f('ix_email_campaigns_template_id'), table_name='email_campaigns')
    op.drop_index(op.f('ix_email_campaigns_user_id'), table_name='email_campaigns')
    op.drop_index(op.f('ix_email_campaigns_organization_id'), table_name='email_campaigns')
    op.drop_index(op.f('ix_email_campaigns_id'), table_name='email_campaigns')
    op.drop_table('email_campaigns')

    # Drop email_templates table
    op.drop_index(op.f('ix_email_templates_user_id'), table_name='email_templates')
    op.drop_index(op.f('ix_email_templates_organization_id'), table_name='email_templates')
    op.drop_index(op.f('ix_email_templates_id'), table_name='email_templates')
    op.drop_table('email_templates')

    # Drop email_domains table
    op.drop_index(op.f('ix_email_domains_organization_id'), table_name='email_domains')
    op.drop_index(op.f('ix_email_domains_id'), table_name='email_domains')
    op.drop_table('email_domains')
