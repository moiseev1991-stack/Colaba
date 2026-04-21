"""Add reply_to fields for email

Revision ID: 011
Revises: 010
Create Date: 2026-03-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '011'
down_revision: Union[str, None] = '010'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add reply_to_email to email_domains
    op.add_column('email_domains', sa.Column('reply_to_email', sa.String(255), nullable=True))
    
    # Add reply_to_email to email_campaigns
    op.add_column('email_campaigns', sa.Column('reply_to_email', sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column('email_campaigns', 'reply_to_email')
    op.drop_column('email_domains', 'reply_to_email')
