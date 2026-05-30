"""ai_prompt в пресетах + кэш AI-анализа компаний

Revision ID: 022
Revises: 021
Create Date: 2026-05-31

Юзер задаёт текстовый промпт в пресете — например:
  «Оцени готовность компании купить SMM-услуги. Score 1-10.»

При применении такого пресета для каждой компании выдачи запускается
LLM-анализ (ProxyAPI/OpenAI-compat), результат — {score, comment} —
кэшируется по хешу промпта (тот же промпт + та же компания → не считаем
дважды). В карточке появляется бейдж «AI: 8/10» с тултипом-обоснованием.

Защита от случайного слива баланса:
- юзер ограничен 100 AI-запросов в сутки (лимит проверяется в API)
- кэш по prompt_hash + company_id (повторный клик не платит)
"""

from alembic import op
import sqlalchemy as sa


revision = "022"
down_revision = "021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. ai_prompt в пресет
    op.add_column(
        "user_filter_presets",
        sa.Column("ai_prompt", sa.Text(), nullable=True),
    )

    # 2. кэш AI-анализа компаний по промпту
    op.create_table(
        "company_ai_analyses",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "company_id",
            sa.BigInteger(),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # SHA256 от текста промпта — стабильный ключ кэша. Меняется промпт —
        # меняется hash — повторно считаем.
        sa.Column("prompt_hash", sa.String(64), nullable=False),
        sa.Column("score", sa.Integer(), nullable=True),     # 0..10 или NULL если LLM не дал число
        sa.Column("comment", sa.Text(), nullable=True),
        # pending → done | failed. UI смотрит на это, чтобы решать «ещё крутится / готово / ошибка»
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("error", sa.Text(), nullable=True),
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
        sa.UniqueConstraint(
            "company_id", "prompt_hash", "user_id",
            name="uq_company_ai_analyses_company_prompt_user",
        ),
    )
    op.create_index(
        "ix_company_ai_analyses_company",
        "company_ai_analyses",
        ["company_id"],
    )
    op.create_index(
        "ix_company_ai_analyses_user_created",
        "company_ai_analyses",
        ["user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_company_ai_analyses_user_created", table_name="company_ai_analyses")
    op.drop_index("ix_company_ai_analyses_company", table_name="company_ai_analyses")
    op.drop_table("company_ai_analyses")
    op.drop_column("user_filter_presets", "ai_prompt")
