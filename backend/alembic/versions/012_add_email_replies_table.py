"""add email_replies table

Revision ID: 012
Revises: 011
Create Date: 2024-03-24

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '012'
down_revision = '011'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create email_replies table
    op.create_table(
        'email_replies',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email_log_id', sa.Integer(), nullable=True),
        sa.Column('campaign_id', sa.Integer(), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('from_email', sa.String(255), nullable=False),
        sa.Column('from_name', sa.String(255), nullable=True),
        sa.Column('subject', sa.String(500), nullable=False),
        sa.Column('body_text', sa.Text(), nullable=True),
        sa.Column('body_html', sa.Text(), nullable=True),
        sa.Column('in_reply_to', sa.String(255), nullable=True),
        sa.Column('references', sa.Text(), nullable=True),
        sa.Column('is_processed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('forwarded_at', sa.DateTime(), nullable=True),
        sa.Column('forwarded_to', sa.String(255), nullable=True),
        sa.Column('received_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['email_log_id'], ['email_logs.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['campaign_id'], ['email_campaigns.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
    
    # Create indexes
    op.create_index('ix_email_replies_id', 'email_replies', ['id'])
    op.create_index('ix_email_replies_email_log_id', 'email_replies', ['email_log_id'])
    op.create_index('ix_email_replies_campaign_id', 'email_replies', ['campaign_id'])
    op.create_index('ix_email_replies_user_id', 'email_replies', ['user_id'])
    op.create_index('ix_email_replies_from_email', 'email_replies', ['from_email'])
    op.create_index('ix_email_replies_received_at', 'email_replies', ['received_at'])


def downgrade() -> None:
    op.drop_index('ix_email_replies_received_at', 'email_replies')
    op.drop_index('ix_email_replies_from_email', 'email_replies')
    op.drop_index('ix_email_replies_user_id', 'email_replies')
    op.drop_index('ix_email_replies_campaign_id', 'email_replies')
    op.drop_index('ix_email_replies_email_log_id', 'email_replies')
    op.drop_index('ix_email_replies_id', 'email_replies')
    op.drop_table('email_replies')
