"""add started_at and finished_at to searches

Revision ID: 007
Revises: 006
Create Date: 2026-02-26
"""
from alembic import op
import sqlalchemy as sa

revision = '007'
down_revision = '006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('searches', sa.Column('started_at', sa.DateTime(), nullable=True))
    op.add_column('searches', sa.Column('finished_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('searches', 'finished_at')
    op.drop_column('searches', 'started_at')
