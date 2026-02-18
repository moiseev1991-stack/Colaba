"""add_users_table

Revision ID: 001
Revises: 
Create Date: 2026-01-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_superuser', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)

    # Add FKs only if target tables exist (avoids transaction abort on missing tables)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if 'searches' in tables and 'user_id' in [c['name'] for c in inspector.get_columns('searches')]:
        op.create_foreign_key(
            'fk_searches_user_id_users',
            'searches', 'users',
            ['user_id'], ['id']
        )
    if 'blacklist_domains' in tables and 'user_id' in [c['name'] for c in inspector.get_columns('blacklist_domains')]:
        op.create_foreign_key(
            'fk_blacklist_domains_user_id_users',
            'blacklist_domains', 'users',
            ['user_id'], ['id']
        )


def downgrade() -> None:
    # Drop foreign keys first
    try:
        op.drop_constraint('fk_blacklist_domains_user_id_users', 'blacklist_domains', type_='foreignkey')
    except Exception:
        pass
    
    try:
        op.drop_constraint('fk_searches_user_id_users', 'searches', type_='foreignkey')
    except Exception:
        pass
    
    # Drop users table
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_table('users')
