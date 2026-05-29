"""MVP step: company contacts, top quote per pain, lead_lists, outreach_draft assistant

Revision ID: 018
Revises: 017
Create Date: 2026-05-29

Серия изменений под закрытие пайплайна maps → outreach:

1. companies.emails (JSONB), companies.contacts_extra (JSONB),
   companies.contacts_enriched_at (timestamptz)
   — для обогащения контактов из сайта компании.

2. company_pain_scores.top_quote (text), .top_quote_review_id (bigint FK reviews)
   — самый яркий отзыв этой компании, ассоциированный с этим тегом боли.
   Денормализация для быстрого UI («под каждой болью — цитата клиента»).

3. lead_lists, lead_list_items — пользовательские списки лидов (сохранение
   карточек компаний из поиска для последующей отправки кампании).

4. INSERT ai_assistant 'reviews_ai_outreach_draft' (gpt-4o-mini) — ассистент
   для генерации драфта холодного письма по компании+болям+цитатам.
"""

from alembic import op
import sqlalchemy as sa


revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. companies: contacts enrichment
    # ------------------------------------------------------------------
    op.add_column(
        "companies",
        sa.Column("emails", sa.dialects.postgresql.JSONB(), nullable=True),
    )
    op.add_column(
        "companies",
        sa.Column("contacts_extra", sa.dialects.postgresql.JSONB(), nullable=True),
    )
    op.add_column(
        "companies",
        sa.Column("contacts_enriched_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_companies_contacts_enriched_at",
        "companies",
        ["contacts_enriched_at"],
    )

    # ------------------------------------------------------------------
    # 2. company_pain_scores: top quote per pain
    # ------------------------------------------------------------------
    op.add_column(
        "company_pain_scores",
        sa.Column("top_quote", sa.Text(), nullable=True),
    )
    op.add_column(
        "company_pain_scores",
        sa.Column(
            "top_quote_review_id",
            sa.BigInteger(),
            sa.ForeignKey("reviews.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "company_pain_scores",
        sa.Column("top_quote_similarity", sa.Numeric(4, 3), nullable=True),
    )

    # ------------------------------------------------------------------
    # 3. lead_lists
    # ------------------------------------------------------------------
    op.create_table(
        "lead_lists",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "organization_id",
            sa.Integer(),
            sa.ForeignKey("organizations.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "source",
            sa.String(20),
            nullable=False,
            server_default="maps",
        ),  # 'maps' | 'sites' | 'manual'
        sa.Column(
            "items_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_lead_lists_user_created",
        "lead_lists",
        ["user_id", sa.text("created_at DESC")],
    )

    # ------------------------------------------------------------------
    # 4. lead_list_items
    # ------------------------------------------------------------------
    op.create_table(
        "lead_list_items",
        sa.Column(
            "lead_list_id",
            sa.Integer(),
            sa.ForeignKey("lead_lists.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "company_id",
            sa.BigInteger(),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "added_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_index(
        "ix_lead_list_items_company",
        "lead_list_items",
        ["company_id"],
    )

    # ------------------------------------------------------------------
    # 5. Seed ai_assistant 'reviews_ai_outreach_draft' (idempotent)
    # ------------------------------------------------------------------
    op.execute(
        """
        INSERT INTO ai_assistant (name, provider_type, model, config, supports_vision, is_default, updated_at)
        SELECT 'reviews_ai_outreach_draft', 'openai', 'gpt-4o-mini', '{}'::jsonb, false, false, NOW()
        WHERE NOT EXISTS (
            SELECT 1 FROM ai_assistant WHERE name = 'reviews_ai_outreach_draft'
        )
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM ai_assistant WHERE name = 'reviews_ai_outreach_draft'")

    op.drop_index("ix_lead_list_items_company", table_name="lead_list_items")
    op.drop_table("lead_list_items")

    op.drop_index("ix_lead_lists_user_created", table_name="lead_lists")
    op.drop_table("lead_lists")

    op.drop_column("company_pain_scores", "top_quote_similarity")
    op.drop_column("company_pain_scores", "top_quote_review_id")
    op.drop_column("company_pain_scores", "top_quote")

    op.drop_index("ix_companies_contacts_enriched_at", table_name="companies")
    op.drop_column("companies", "contacts_enriched_at")
    op.drop_column("companies", "contacts_extra")
    op.drop_column("companies", "emails")
