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

    # Insert default organization first (needed for searches FK)
    op.execute("""
        INSERT INTO organizations (id, name, created_at)
        SELECT 1, 'Default Organization', NOW()
        WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE id = 1)
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

    # Create searches table if not exists (002 expects it but 001 doesn't create it)
    if 'searches' not in existing_tables:
        op.create_table(
            'searches',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('organization_id', sa.Integer(), nullable=True),
            sa.Column('query', sa.String(length=500), nullable=False),
            sa.Column('search_provider', sa.String(length=50), server_default='duckduckgo'),
            sa.Column('num_results', sa.Integer(), server_default='50'),
            sa.Column('status', sa.String(length=50), server_default='pending'),
            sa.Column('result_count', sa.Integer(), server_default='0'),
            sa.Column('config', postgresql.JSON(astext_type=sa.Text()), server_default='{}'),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['organization_id'], ['organizations.id']),
            sa.ForeignKeyConstraint(['user_id'], ['users.id']),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_searches_id'), 'searches', ['id'], unique=False)
        op.create_index(op.f('ix_searches_organization_id'), 'searches', ['organization_id'], unique=False)
        op.create_index(op.f('ix_searches_user_id'), 'searches', ['user_id'], unique=False)
    else:
        existing_columns = [col['name'] for col in inspector.get_columns('searches')]
        if 'organization_id' not in existing_columns:
            op.add_column('searches', sa.Column('organization_id', sa.Integer(), nullable=True))
            op.create_index(op.f('ix_searches_organization_id'), 'searches', ['organization_id'], unique=False)
            op.create_foreign_key('fk_searches_organization_id_organizations', 'searches', 'organizations', ['organization_id'], ['id'])

    # Create search_results, filters, blacklist_domains if not exist
    if 'search_results' not in existing_tables:
        op.create_table(
            'search_results',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('search_id', sa.Integer(), nullable=False),
            sa.Column('position', sa.Integer(), nullable=False),
            sa.Column('title', sa.String(length=500), nullable=False),
            sa.Column('url', sa.Text(), nullable=False),
            sa.Column('snippet', sa.Text(), nullable=True),
            sa.Column('domain', sa.String(length=255), nullable=True),
            sa.Column('seo_score', sa.Integer(), nullable=True),
            sa.Column('phone', sa.String(length=50), nullable=True),
            sa.Column('email', sa.String(length=255), nullable=True),
            sa.Column('contact_status', sa.String(length=50), nullable=True),
            sa.Column('outreach_subject', sa.Text(), nullable=True),
            sa.Column('outreach_text', sa.Text(), nullable=True),
            sa.Column('extra_data', postgresql.JSON(astext_type=sa.Text()), server_default='{}'),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['search_id'], ['searches.id']),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_search_results_id'), 'search_results', ['id'], unique=False)
        op.create_index(op.f('ix_search_results_search_id'), 'search_results', ['search_id'], unique=False)
    if 'filters' not in existing_tables:
        op.create_table(
            'filters',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(length=200), nullable=False),
            sa.Column('filter_type', sa.String(length=50), nullable=False),
            sa.Column('config', postgresql.JSON(astext_type=sa.Text()), server_default='{}'),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_filters_id'), 'filters', ['id'], unique=False)
    if 'blacklist_domains' not in existing_tables:
        op.create_table(
            'blacklist_domains',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('domain', sa.String(length=255), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.id']),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_blacklist_domains_id'), 'blacklist_domains', ['id'], unique=False)
        op.create_index(op.f('ix_blacklist_domains_domain'), 'blacklist_domains', ['domain'], unique=True)
        op.create_index(op.f('ix_blacklist_domains_user_id'), 'blacklist_domains', ['user_id'], unique=False)

    # Assign all existing users to default organization as owners
    op.execute("""
        INSERT INTO user_organizations (user_id, organization_id, role, created_at)
        SELECT u.id, 1, 'OWNER'::organizationrole, NOW()
        FROM users u
        WHERE NOT EXISTS (SELECT 1 FROM user_organizations uo WHERE uo.user_id = u.id AND uo.organization_id = 1)
    """)

    # Update searches if table has organization_id and rows exist
    if 'searches' in inspector.get_table_names():
        cols = [c['name'] for c in inspector.get_columns('searches')]
        if 'organization_id' in cols:
            op.execute("""
                UPDATE searches SET organization_id = 1 WHERE organization_id IS NULL
            """)
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
