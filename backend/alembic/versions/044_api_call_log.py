"""add api_call_log table

Revision ID: 044
Revises: 043
Create Date: 2026-07-05

Создаёт таблицу лога внешних API-вызовов для учёта стоимости.

Каждая строка — один вызов внешнего платного сервиса (2GIS/SerpAPI/
DaData/OpenAI/Anthropic/Embeddings/2captcha/Hyvor/SMTP/...). Заполняется
трекером app.core.api_tracker.log_call() — fire-and-forget запись из
точек-обёрток (_request в провайдерах, chat в LLM, _suggest в DaData).

Индексы:
- created_at — основной (последние N для monitor, TTL-чистка потом).
- user_id, map_search_id, company_id — фильтры по контексту.
- provider — фильтр/агрегат по провайдеру.
Составные не делаем — для MVP достаточно single-column; под добавим
частичные/составные если потребуется (per-user+period агрегаты).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "044"
down_revision: Union[str, None] = "043"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "api_call_log",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("map_search_id", sa.BigInteger(), nullable=True),
        sa.Column("company_id", sa.BigInteger(), nullable=True),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("endpoint", sa.String(length=255), nullable=False),
        sa.Column("method", sa.String(length=10), nullable=True),
        sa.Column("http_status", sa.Integer(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column(
            "ok",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("prompt_tokens", sa.Integer(), nullable=True),
        sa.Column("completion_tokens", sa.Integer(), nullable=True),
        sa.Column("model", sa.String(length=100), nullable=True),
        sa.Column(
            "cost_rub",
            sa.Numeric(precision=12, scale=6),
            nullable=False,
            server_default="0",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_api_call_log_created_at"),
        "api_call_log",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_api_call_log_user_id"),
        "api_call_log",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_api_call_log_map_search_id"),
        "api_call_log",
        ["map_search_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_api_call_log_company_id"),
        "api_call_log",
        ["company_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_api_call_log_provider"),
        "api_call_log",
        ["provider"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_api_call_log_provider"), table_name="api_call_log")
    op.drop_index(op.f("ix_api_call_log_company_id"), table_name="api_call_log")
    op.drop_index(op.f("ix_api_call_log_map_search_id"), table_name="api_call_log")
    op.drop_index(op.f("ix_api_call_log_user_id"), table_name="api_call_log")
    op.drop_index(op.f("ix_api_call_log_created_at"), table_name="api_call_log")
    op.drop_table("api_call_log")
