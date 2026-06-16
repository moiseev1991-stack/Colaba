"""pain_tags.sentiment + расширение UniqueConstraint

Revision ID: 035
Revises: 034
Create Date: 2026-06-16

Добавляет колонку sentiment в pain_tags для разделения «болевых» (negative)
и «сильно-сторонних» (positive) кластеров. Существующие записи получают
sentiment='negative' (раньше recluster кластеризовал только негатив).

UniqueConstraint расширяется с (niche, city, label) до (niche, city, label,
sentiment) — чтобы один и тот же label мог существовать и в negative-,
и в positive-наборах (например, «Цены» — как боль и как похвала).

ВАЖНО: эта миграция только меняет схему. Она НЕ запускает recluster по
позитиву; positive-кластеры появятся после прогона admin-задачи
recluster_pain_tags(sentiment='positive'), которая будет добавлена
следующим PR.
"""

from alembic import op
import sqlalchemy as sa


revision = "035"
down_revision = "034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Колонка с дефолтом 'negative' — чтобы существующие 7-значные тысячи
    #    pain_tag-строк автоматически прошли NOT NULL.
    op.add_column(
        "pain_tags",
        sa.Column(
            "sentiment",
            sa.String(length=10),
            nullable=False,
            server_default=sa.text("'negative'"),
        ),
    )
    # CHECK constraint — только два валидных значения. Расширим позже,
    # если понадобится neutral/mixed.
    op.create_check_constraint(
        "ck_pain_tags_sentiment",
        "pain_tags",
        "sentiment IN ('negative', 'positive')",
    )

    # 2. Старый UniqueConstraint (niche, city, label) заменяем на расширенный.
    op.drop_constraint("uq_pain_tags_niche_city_label", "pain_tags", type_="unique")
    op.create_unique_constraint(
        "uq_pain_tags_niche_city_label_sentiment",
        "pain_tags",
        ["niche", "city", "label", "sentiment"],
    )

    # 3. Индекс по sentiment для быстрого фильтра в /maps/pain-tags.
    op.create_index(
        "ix_pain_tags_sentiment",
        "pain_tags",
        ["sentiment"],
    )


def downgrade() -> None:
    op.drop_index("ix_pain_tags_sentiment", table_name="pain_tags")
    op.drop_constraint(
        "uq_pain_tags_niche_city_label_sentiment", "pain_tags", type_="unique"
    )
    op.create_unique_constraint(
        "uq_pain_tags_niche_city_label",
        "pain_tags",
        ["niche", "city", "label"],
    )
    op.drop_constraint("ck_pain_tags_sentiment", "pain_tags", type_="check")
    op.drop_column("pain_tags", "sentiment")
