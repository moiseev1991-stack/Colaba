"""make search organization_id nullable for superusers

Revision ID: 003
Revises: 002
Create Date: 2026-01-23 23:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '003'
down_revision = '002_organizations'
branch_labels = None
depends_on = None


def upgrade():
    # Make organization_id nullable for superuser global searches
    op.alter_column('searches', 'organization_id',
                    existing_type=sa.Integer(),
                    nullable=True)


def downgrade():
    # Revert to non-nullable (but this will fail if there are NULL values)
    op.alter_column('searches', 'organization_id',
                    existing_type=sa.Integer(),
                    nullable=False)
