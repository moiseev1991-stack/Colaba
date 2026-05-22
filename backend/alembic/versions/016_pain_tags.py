"""reviews_ai — pain_tags, review_pain_tags, company_pain_scores

Revision ID: 016
Revises: 015
Create Date: 2026-05-22

AI-таблицы модуля reviews_ai. Заполняются Celery-задачами модуля reviews_ai
(см. backend/app/modules/reviews_ai/tasks.py — добавляется в ШАГе 9 ТЗ).

- pain_tags: автоматически создаваемые «теги болей» на (niche, city) кластеры
  отзывов. centroid (VECTOR 1536) — среднее по embeddings отзывов кластера;
  по нему матчатся новые отзывы (cosine similarity).
- review_pain_tags: M:N связь reviews↔pain_tags с similarity (0..1).
- company_pain_scores: денормализация для быстрой фильтрации компаний по тегам.

Дополнительно: частичный UNIQUE на (niche, label) при city IS NULL — без него
UPSERT глобального тега ниши даёт дубли (в Postgres NULL ≠ NULL в составном UNIQUE).
"""

from alembic import op
import sqlalchemy as sa


revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ---------- pain_tags ----------
    op.create_table(
        "pain_tags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("niche", sa.String(100), nullable=False),
        sa.Column("city", sa.String(100), nullable=True),  # NULL = глобальный для ниши
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("occurrences_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cluster_size", sa.Integer(), nullable=True),
        sa.Column("examples", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),  # active|archived
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("niche", "city", "label", name="uq_pain_tags_niche_city_label"),
    )
    # VECTOR(1536) — через raw SQL, как в reviews.embedding
    op.execute("ALTER TABLE pain_tags ADD COLUMN centroid vector(1536)")

    op.create_index("ix_pain_tags_niche", "pain_tags", ["niche", "city"])
    op.create_index("ix_pain_tags_status", "pain_tags", ["status"])
    # Частичный UNIQUE для глобальных тегов (city IS NULL), чтобы UPSERT не дублировал
    op.execute(
        "CREATE UNIQUE INDEX ux_pain_tags_global ON pain_tags (niche, label) WHERE city IS NULL"
    )

    # ---------- review_pain_tags (M:N) ----------
    op.create_table(
        "review_pain_tags",
        sa.Column(
            "review_id", sa.BigInteger(),
            sa.ForeignKey("reviews.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "pain_tag_id", sa.Integer(),
            sa.ForeignKey("pain_tags.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("similarity", sa.Numeric(4, 3), nullable=True),
    )
    op.create_index("ix_review_pain_tags_tag", "review_pain_tags", ["pain_tag_id"])

    # ---------- company_pain_scores (денормализация) ----------
    op.create_table(
        "company_pain_scores",
        sa.Column(
            "company_id", sa.BigInteger(),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "pain_tag_id", sa.Integer(),
            sa.ForeignKey("pain_tags.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("mention_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("first_mention_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_mention_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_company_pain_scores_tag",
        "company_pain_scores",
        ["pain_tag_id", sa.text("mention_count DESC")],
    )
    op.create_index("ix_company_pain_scores_company", "company_pain_scores", ["company_id"])


def downgrade() -> None:
    op.drop_index("ix_company_pain_scores_company", table_name="company_pain_scores")
    op.drop_index("ix_company_pain_scores_tag", table_name="company_pain_scores")
    op.drop_table("company_pain_scores")

    op.drop_index("ix_review_pain_tags_tag", table_name="review_pain_tags")
    op.drop_table("review_pain_tags")

    op.execute("DROP INDEX IF EXISTS ux_pain_tags_global")
    op.drop_index("ix_pain_tags_status", table_name="pain_tags")
    op.drop_index("ix_pain_tags_niche", table_name="pain_tags")
    op.drop_table("pain_tags")
    # extensions НЕ удаляем (vector использует reviews.embedding из 015)
