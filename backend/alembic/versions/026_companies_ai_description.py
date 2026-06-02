"""companies.ai_description — кэш AI-описания для блока «Производство сайта»

Revision ID: 026
Revises: 025
Create Date: 2026-06-02

Блок 4C ТЗ 2026-06-02. Короткое AI-описание компании (1-2 предложения) на
основе рубрики + топ позитивных отзывов. Используется верстальщиком сайта
для hero/SEO-тайтла. Генерируется в фоне Celery-таском
generate_company_description (очередь maps_ai_description).

Поле ai_description_generated_at — anti-thrash: если описание уже было
сгенерено, повторный запуск тасков пропускает (см. company_description.py).

Также сидим нового LLM-ассистента `reviews_ai_company_description`
(gpt-4o-mini через ProxyAPI). По аналогии с 017/018.
"""

from alembic import op
import sqlalchemy as sa


revision = "026"
down_revision = "025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "companies",
        sa.Column("ai_description", sa.Text(), nullable=True),
    )
    op.add_column(
        "companies",
        sa.Column(
            "ai_description_generated_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    # Сид ассистента reviews_ai_company_description (idempotent).
    op.execute(
        """
        INSERT INTO ai_assistant (name, provider_type, model, config, supports_vision, is_default, updated_at)
        SELECT 'reviews_ai_company_description', 'openai', 'gpt-4o-mini', '{}'::jsonb, false, false, NOW()
        WHERE NOT EXISTS (
            SELECT 1 FROM ai_assistant WHERE name = 'reviews_ai_company_description'
        )
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM ai_assistant WHERE name = 'reviews_ai_company_description'")
    op.drop_column("companies", "ai_description_generated_at")
    op.drop_column("companies", "ai_description")
