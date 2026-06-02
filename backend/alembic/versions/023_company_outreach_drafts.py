"""company_outreach_drafts — кэш сгенерированных LLM-писем по компаниям

Revision ID: 023
Revises: 022
Create Date: 2026-06-02

Таблица хранит последний сгенерированный draft холодного письма по компании
для каждого «угла услуги» (website / reputation / automation / seo). Угол
'auto' резолвится на стороне сервиса в один из конкретных и сохраняется
именно как конкретный угол — это даёт детерминированный кэш.

Кэш нужен чтобы повторное открытие drawer'а карточки не жгло токены LLM.
Регенерация — по явной кнопке (UI передаёт regenerate=true, сервис
перезаписывает запись).

Ассистент `reviews_ai_outreach_draft` уже создан миграцией 018; новых
ассистентов не добавляем.
"""

from alembic import op
import sqlalchemy as sa


revision = "023"
down_revision = "022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "company_outreach_drafts",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "company_id",
            sa.BigInteger(),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Конкретный угол, под который сгенерили (auto на этом уровне уже
        # резолвнут). Длина 32 — с запасом, реальные значения 8-10 символов.
        sa.Column("angle", sa.String(32), nullable=False),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        # Какие pain-теги пошли в промпт (массив объектов
        # {pain_tag_id, label, quote_review_id, similarity}). Для аудита и
        # для UI «подсветить какие боли использованы».
        sa.Column(
            "pains_used",
            sa.dialects.postgresql.JSONB(),
            nullable=True,
        ),
        sa.Column(
            "tone",
            sa.String(16),
            nullable=False,
            server_default="friendly",
        ),
        sa.Column(
            "language",
            sa.String(8),
            nullable=False,
            server_default="ru",
        ),
        # Опционально — какая модель сгенерила (для будущих экспериментов
        # с разными моделями на одной компании). NULL если не отследили.
        sa.Column("model_used", sa.String(64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        # Одна запись на (компанию, угол). Регенерация перезаписывает.
        sa.UniqueConstraint(
            "company_id",
            "angle",
            name="uq_company_outreach_drafts_company_angle",
        ),
    )
    op.create_index(
        "ix_company_outreach_drafts_company_id",
        "company_outreach_drafts",
        ["company_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_company_outreach_drafts_company_id",
        table_name="company_outreach_drafts",
    )
    op.drop_table("company_outreach_drafts")
