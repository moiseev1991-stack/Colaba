"""niche_pain_clusters — агрегированные боли по нише на уровне поиска

Revision ID: 033
Revises: 032
Create Date: 2026-06-08

Идея юзера 2026-06-08: «AI-отчёт по нише». Сейчас мы делаем диагноз
по компании; здесь — диагноз по всей выдаче поиска. Используется для:

  1. Готовая презентация для B2B-поставщика «вот точки боли всего рынка».
  2. Сравнительная аналитика «какая ниша где больше болит».
  3. Сам по себе продаваемый артефакт — «AI-отчёт по нише, 4 990 ₽».

Что хранится:

- search_id   — поиск, к которому привязан кластер
- niche, city — денормализованы для быстрых выборок без JOIN MapSearch
- cluster_label   — имя кластера (взято из pain_tags.label в MVP-варианте;
                   позже можно заменить на LLM-имя меж-нишевого embedding-
                   кластера, схема не изменится)
- pain_tag_ids    — INT[] исходных pain_tags, попавших в кластер
                   (для drill-down на компании)
- company_count   — у скольких компаний выдачи встречается этот pain
- frequency_pct   — company_count / total_in_search * 100, округлено
- total_mentions  — суммарный mention_count по всем компаниям
- sample_quotes   — JSONB: [{quote, company_name, posted_at?}]
                   топ-5 цитат для UI «вот живой текст жалобы»
- generated_at    — когда таска aggregate_niche_pain_clusters последний раз
                   обновила эту запись

UNIQUE (search_id, cluster_label) — для UPSERT идемпотентного пересчёта.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "033"
down_revision = "032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "niche_pain_clusters",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "search_id",
            sa.BigInteger(),
            sa.ForeignKey("map_searches.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("niche", sa.String(120), nullable=False),
        sa.Column("city", sa.String(120), nullable=True),
        sa.Column("cluster_label", sa.String(200), nullable=False),
        sa.Column(
            "pain_tag_ids",
            postgresql.ARRAY(sa.Integer()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("company_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "frequency_pct",
            sa.Numeric(5, 2),
            nullable=False,
            server_default="0",
        ),
        sa.Column("total_mentions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "sample_quotes",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint(
            "search_id", "cluster_label", name="uq_niche_pain_cluster_search_label"
        ),
    )

    # Чтение «дай все кластеры этого поиска, отсортированные по частоте» —
    # самое частое использование (UI-вкладка).
    op.create_index(
        "ix_niche_pain_cluster_search_freq",
        "niche_pain_clusters",
        ["search_id", sa.text("frequency_pct DESC")],
    )

    # Перекрёстный кейс «дай все кластеры по нише, без привязки к конкретному
    # поиску» — для будущей сводной по niche+city между поисками.
    op.create_index(
        "ix_niche_pain_cluster_niche_city",
        "niche_pain_clusters",
        ["niche", "city"],
    )


def downgrade() -> None:
    op.drop_index("ix_niche_pain_cluster_niche_city", table_name="niche_pain_clusters")
    op.drop_index("ix_niche_pain_cluster_search_freq", table_name="niche_pain_clusters")
    op.drop_table("niche_pain_clusters")
