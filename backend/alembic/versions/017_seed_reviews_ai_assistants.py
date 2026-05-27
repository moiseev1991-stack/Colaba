"""seed reviews_ai assistants (sentiment + naming)

Revision ID: 017
Revises: 016
Create Date: 2026-05-27

Идемпотентно создаёт двух AI-ассистентов для модуля reviews_ai:
- reviews_ai_sentiment — gpt-4o-mini, дешёвая sentiment-классификация
- reviews_ai_naming    — gpt-4o-mini, naming кластеров болей (тоже mini — задача
  лёгкая, экономим)

Ключ/base_url в `config` НЕ зашиты — `_chat_openai` в
`app/modules/ai_assistants/client.py` фолбэчит на settings.OPENAI_API_KEY /
settings.OPENAI_BASE_URL, если в config пусто. Это позволяет хранить ключ
ProxyAPI в env (`/opt/colaba/.env`) и не светить его в БД.

В env-переменные:
  REVIEWS_AI_SENTIMENT_ASSISTANT_NAME=reviews_ai_sentiment
  REVIEWS_AI_NAMING_ASSISTANT_NAME=reviews_ai_naming
тогда pick_assistant_id находит их строго по имени, без auto-pick.

Миграция reversible (downgrade удаляет только эти два имени).
"""

from alembic import op


revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


_ASSISTANTS = [
    # (name, provider_type, model)
    ("reviews_ai_sentiment", "openai", "gpt-4o-mini"),
    ("reviews_ai_naming",    "openai", "gpt-4o-mini"),
]


def upgrade() -> None:
    for name, provider, model in _ASSISTANTS:
        op.execute(
            f"""
            INSERT INTO ai_assistant (name, provider_type, model, config, supports_vision, is_default, updated_at)
            SELECT '{name}', '{provider}', '{model}', '{{}}'::jsonb, false, false, NOW()
            WHERE NOT EXISTS (
                SELECT 1 FROM ai_assistant WHERE name = '{name}'
            )
            """
        )


def downgrade() -> None:
    for name, _, _ in _ASSISTANTS:
        op.execute(f"DELETE FROM ai_assistant WHERE name = '{name}'")
