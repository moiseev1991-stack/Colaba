"""add organizations and multitenancy

Revision ID: 002_organizations
Revises: 001_add_users
Create Date: 2026-01-23 20:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '002_organizations'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create organizations table (if not exists)
    from sqlalchemy import inspect
    conn = op.get_bind()
    inspector = inspect(conn)
    existing_tables = inspector.get_table_names()
    
    if 'organizations' not in existing_tables:
        op.create_table(
            'organizations',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(length=255), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_organizations_id'), 'organizations', ['id'], unique=False)
        op.create_index(op.f('ix_organizations_name'), 'organizations', ['name'], unique=False)

    # Create enum type if not exists (use uppercase to match existing)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE organizationrole AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)

    # Create user_organizations association table (if not exists)
    if 'user_organizations' not in existing_tables:
        op.create_table(
            'user_organizations',
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('organization_id', sa.Integer(), nullable=False),
            sa.Column('role', postgresql.ENUM('owner', 'admin', 'member', name='organizationrole', create_type=False), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('user_id', 'organization_id')
        )

    # Add organization_id to searches table (if not exists)
    existing_columns = [col['name'] for col in inspector.get_columns('searches')]
    if 'organization_id' not in existing_columns:
        op.add_column('searches', sa.Column('organization_id', sa.Integer(), nullable=True))
        op.create_index(op.f('ix_searches_organization_id'), 'searches', ['organization_id'], unique=False)
        op.create_foreign_key('fk_searches_organization_id_organizations', 'searches', 'organizations', ['organization_id'], ['id'])

    # Create default organization for existing users and assign existing searches
    # First, create a default organization
    op.execute("""
        INSERT INTO organizations (id, name, created_at)
        VALUES (1, 'Default Organization', NOW())
    """)
    
    # Assign all existing users to default organization as owners
    op.execute("""
        INSERT INTO user_organizations (user_id, organization_id, role, created_at)
        SELECT id, 1, 'OWNER'::organizationrole, NOW()
        FROM users
    """)
    
    # Assign all existing searches to default organization
    op.execute("""
        UPDATE searches
        SET organization_id = 1
        WHERE organization_id IS NULL
    """)
    
    # Make organization_id NOT NULL after assigning default values
    op.alter_column('searches', 'organization_id', nullable=False)


def downgrade() -> None:
    # Remove organization_id from searches
    op.drop_constraint('fk_searches_organization_id_organizations', 'searches', type_='foreignkey')
    op.drop_index(op.f('ix_searches_organization_id'), table_name='searches')
    op.drop_column('searches', 'organization_id')

    # Drop user_organizations table
    op.drop_table('user_organizations')

    # Drop organizations table
    op.drop_index(op.f('ix_organizations_name'), table_name='organizations')
    op.drop_index(op.f('ix_organizations_id'), table_name='organizations')
    op.drop_table('organizations')
    
    # Drop enum type
    op.execute("DROP TYPE IF EXISTS organizationrole")
