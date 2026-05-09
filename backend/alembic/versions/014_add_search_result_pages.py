"""add search_result_pages with full-text search

Revision ID: 014
Revises: 013
Create Date: 2026-05-04

Per-page crawled content lives in its own table so we can full-text-search it
with Postgres tsvector + GIN, instead of keeping multi-MB blobs inside JSON.
The search_results table stays compact; one row here per crawled page.
"""

from alembic import op
import sqlalchemy as sa


revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "search_result_pages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "search_result_id",
            sa.Integer(),
            sa.ForeignKey("search_results.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Denormalised search_id so we can filter without joining the parent.
        sa.Column(
            "search_id",
            sa.Integer(),
            sa.ForeignKey("searches.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("meta_description", sa.Text(), nullable=True),
        sa.Column("h1_text", sa.Text(), nullable=True),
        # Cleaned visible text — what FTS actually searches over. Capped on the
        # application side (~10 KB) so the row stays small enough for the heap.
        sa.Column("text_content", sa.Text(), nullable=True),
        # Generated tsvector with russian stemming + simple as a fallback so
        # English brand names still match. STORED so the GIN index can use it.
        sa.Column(
            "search_vector",
            sa.dialects.postgresql.TSVECTOR(),
            sa.Computed(
                "setweight(to_tsvector('russian', coalesce(title, '')), 'A') || "
                "setweight(to_tsvector('russian', coalesce(meta_description, '')), 'B') || "
                "setweight(to_tsvector('russian', coalesce(h1_text, '')), 'B') || "
                "setweight(to_tsvector('russian', coalesce(text_content, '')), 'C')",
                persisted=True,
            ),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    op.create_index(
        "ix_search_result_pages_search_result_id",
        "search_result_pages",
        ["search_result_id"],
    )
    op.create_index(
        "ix_search_result_pages_search_id",
        "search_result_pages",
        ["search_id"],
    )
    # GIN over the generated tsvector — this is what makes keyword filtering fast.
    op.create_index(
        "ix_search_result_pages_search_vector",
        "search_result_pages",
        ["search_vector"],
        postgresql_using="gin",
    )


def downgrade() -> None:
    op.drop_index("ix_search_result_pages_search_vector", table_name="search_result_pages")
    op.drop_index("ix_search_result_pages_search_id", table_name="search_result_pages")
    op.drop_index("ix_search_result_pages_search_result_id", table_name="search_result_pages")
    op.drop_table("search_result_pages")
