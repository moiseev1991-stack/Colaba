"""Add deployments table

Revision ID: 008
Revises: 007
Create Date: 2026-03-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '008'
down_revision: Union[str, None] = '006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create deployments table
    op.create_table(
        'deployments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('version', sa.String(50), nullable=False),
        sa.Column('git_sha', sa.String(50), nullable=False),
        sa.Column('environment', sa.Enum('staging', 'production', name='deploymentenvironment'), nullable=False),
        sa.Column('changelog', sa.Text(), nullable=True),
        sa.Column('deployed_at', sa.DateTime(), nullable=False),
        sa.Column('deployed_by', sa.String(255), nullable=True),
        sa.Column('status', sa.Enum('success', 'failed', 'rolled_back', name='deploymentstatus'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_deployments_id'), 'deployments', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_deployments_id'), table_name='deployments')
    op.drop_table('deployments')
    op.execute('DROP TYPE IF EXISTS deploymentstatus')
    op.execute('DROP TYPE IF EXISTS deploymentenvironment')
