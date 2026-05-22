"""maps module — companies, reviews, map_searches, cache

Revision ID: 015
Revises: 014
Create Date: 2026-05-22

Базовые таблицы модуля maps (парсер 2GIS / Яндекс.Карт):
- companies: компании-лиды из карт
- reviews: отзывы с embedding-колонкой (pgvector) для AI-классификации в 016
- map_search_cache: TTL-кэш по (ниша, город, источник)
- map_searches: история поисков пользователя
- map_search_results: связь поиск↔компания

Также подключаем расширения PostgreSQL: pg_trgm (триграммный индекс
на name для быстрого поиска по подстроке) и vector (pgvector для embeddings).
Колонка embedding объявлена в этой миграции, но реально заполняется
после миграции 016 (модуль reviews_ai).
"""

from alembic import op
import sqlalchemy as sa


revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # extensions нужны до создания таблиц с GIN-индексом и VECTOR-колонкой
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # ---------- companies ----------
    op.create_table(
        "companies",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "organization_id",
            sa.Integer(),
            sa.ForeignKey("organizations.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("source", sa.String(20), nullable=False),       # '2gis' | 'yandex_maps'
        sa.Column("external_id", sa.String(255), nullable=False), # ID компании в источнике
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("niche", sa.String(100), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("address", sa.String(500), nullable=True),
        sa.Column("lat", sa.Numeric(9, 6), nullable=True),
        sa.Column("lng", sa.Numeric(9, 6), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("website", sa.String(500), nullable=True),
        sa.Column("rating", sa.Numeric(3, 2), nullable=True),
        sa.Column("reviews_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reviews_positive_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reviews_negative_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reviews_neutral_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("has_owner_replies", sa.Boolean(), nullable=False, server_default=sa.text("FALSE")),
        sa.Column("owner_replies_count", sa.Integer(), nullable=False, server_default="0"),
        # rating_history: [{"date": "2026-05-22", "rating": 4.2}, ...]
        sa.Column("rating_history", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("last_review_at", sa.DateTime(timezone=True), nullable=True),
        # raw_data: полный ответ источника, для отладки и будущего ре-парсинга
        sa.Column("raw_data", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("source", "external_id", name="uq_companies_source_external_id"),
    )
    op.create_index("ix_companies_niche_city", "companies", ["niche", "city"])
    op.create_index("ix_companies_rating", "companies", ["rating"])
    op.create_index("ix_companies_organization_id", "companies", ["organization_id"])
    op.create_index(
        "ix_companies_name_trgm",
        "companies",
        ["name"],
        postgresql_using="gin",
        postgresql_ops={"name": "gin_trgm_ops"},
    )

    # ---------- reviews ----------
    op.create_table(
        "reviews",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "company_id",
            sa.BigInteger(),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("external_id", sa.String(255), nullable=True),
        sa.Column("author_masked", sa.String(50), nullable=True),
        sa.Column("rating", sa.SmallInteger(), nullable=True),
        sa.Column("raw_text", sa.Text(), nullable=True),
        # raw_text удаляется по cron'у после 30 дней — оставляем sentiment/embedding/agg.
        sa.Column("raw_text_purged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sentiment", sa.String(10), nullable=True),       # 'positive'|'negative'|'neutral'
        sa.Column("sentiment_score", sa.Numeric(3, 2), nullable=True),
        sa.Column("source_url", sa.String(500), nullable=True),
        sa.Column("posted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("has_owner_reply", sa.Boolean(), nullable=False, server_default=sa.text("FALSE")),
        # text_hash — дедуп отзывов в рамках компании (нормализованный sha256).
        sa.Column("text_hash", sa.String(64), nullable=True),
        sa.Column("ai_processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    # Колонка embedding: pgvector VECTOR(1536) — размерность под OpenAI text-embedding-3-small.
    # Если в будущем сменим провайдера на Yandex (256 dim) — отдельной миграцией ALTER TYPE.
    op.execute("ALTER TABLE reviews ADD COLUMN embedding vector(1536)")

    op.create_index(
        "ix_reviews_company_posted",
        "reviews",
        ["company_id", sa.text("posted_at DESC")],
    )
    op.create_index(
        "ix_reviews_sentiment",
        "reviews",
        ["sentiment"],
        postgresql_where=sa.text("sentiment IS NOT NULL"),
    )
    op.create_index(
        "ux_reviews_company_text_hash",
        "reviews",
        ["company_id", "text_hash"],
        unique=True,
    )
    op.create_index(
        "ix_reviews_unprocessed",
        "reviews",
        ["id"],
        postgresql_where=sa.text("ai_processed_at IS NULL"),
    )
    # IVFFlat-индекс для cosine similarity по embedding.
    # lists=100 — компромисс под объём до ~1M отзывов; пересоздавать после массовой загрузки.
    op.execute(
        "CREATE INDEX ix_reviews_embedding ON reviews "
        "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
    )

    # ---------- map_search_cache ----------
    op.create_table(
        "map_search_cache",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("niche", sa.String(100), nullable=False),
        sa.Column("city", sa.String(100), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("companies_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reviews_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("parsed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("niche", "city", "source", name="uq_map_search_cache_key"),
    )
    op.create_index("ix_map_search_cache_expires", "map_search_cache", ["expires_at"])

    # ---------- map_searches ----------
    op.create_table(
        "map_searches",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "organization_id",
            sa.Integer(),
            sa.ForeignKey("organizations.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("niche", sa.String(100), nullable=False),
        sa.Column("city", sa.String(100), nullable=False),
        # sources хранится строкой через запятую: '2gis' или '2gis,yandex_maps'.
        # Делать ARRAY(String) лишний оверкилл — источников максимум 3 и порядок не важен.
        sa.Column("sources", sa.String(100), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),  # pending|running|completed|failed|from_cache
        sa.Column("filters", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("companies_found", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reviews_found", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ai_progress", sa.String(20), nullable=False, server_default="pending"),  # pending|running|done|skipped
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("error_type", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_map_searches_user_id", "map_searches", ["user_id"])
    op.create_index("ix_map_searches_status", "map_searches", ["status"])
    op.create_index(
        "ix_map_searches_created_at",
        "map_searches",
        [sa.text("created_at DESC")],
    )

    # ---------- map_search_results (M:N с position) ----------
    op.create_table(
        "map_search_results",
        sa.Column(
            "map_search_id",
            sa.BigInteger(),
            sa.ForeignKey("map_searches.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "company_id",
            sa.BigInteger(),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("position", sa.Integer(), nullable=True),
    )
    op.create_index("ix_map_search_results_search_id", "map_search_results", ["map_search_id"])


def downgrade() -> None:
    # порядок обратный create — сначала зависимые таблицы
    op.drop_index("ix_map_search_results_search_id", table_name="map_search_results")
    op.drop_table("map_search_results")

    op.drop_index("ix_map_searches_created_at", table_name="map_searches")
    op.drop_index("ix_map_searches_status", table_name="map_searches")
    op.drop_index("ix_map_searches_user_id", table_name="map_searches")
    op.drop_table("map_searches")

    op.drop_index("ix_map_search_cache_expires", table_name="map_search_cache")
    op.drop_table("map_search_cache")

    op.execute("DROP INDEX IF EXISTS ix_reviews_embedding")
    op.drop_index("ix_reviews_unprocessed", table_name="reviews")
    op.drop_index("ux_reviews_company_text_hash", table_name="reviews")
    op.drop_index("ix_reviews_sentiment", table_name="reviews")
    op.drop_index("ix_reviews_company_posted", table_name="reviews")
    op.drop_table("reviews")

    op.drop_index("ix_companies_name_trgm", table_name="companies")
    op.drop_index("ix_companies_organization_id", table_name="companies")
    op.drop_index("ix_companies_rating", table_name="companies")
    op.drop_index("ix_companies_niche_city", table_name="companies")
    op.drop_table("companies")

    # extensions НЕ удаляем — другие модули/миграции могут их использовать
