"""kp_generation_jobs — bulk-генерация КП по выделению

Revision ID: 036
Revises: 035
Create Date: 2026-06-17

Таблица состояний bulk-job'а генерации КП. На каждый запуск «Сформировать
КП для выбранных» создаётся одна строка; Celery-task `generate_kp_bulk_task`
итерирует по company_ids и инкрементит счётчики generated/failed.

UI поллит GET /outreach/kp/jobs/{id} каждые 1.5 сек и рендерит прогресс
+ список последних созданных drafts. Кнопка «Отменить» ставит
cancel_requested=true; task проверяет флаг на каждой итерации.

Поля:
  status: queued / running / done / cancelled / failed
  template_key / tone / custom_sender_profile — то же, что у одиночной
    /outreach/kp/generate; кэшируем здесь, чтобы task не зависел от
    юзеровского state между запуском и обработкой.
  company_ids JSONB — снимок выбранных id в порядке обработки.
  total / generated / failed — счётчики; total = len(company_ids).
  last_company_id — для UI «сейчас обрабатываю …».
  cancel_requested — флаг отмены, выставляет API.
"""

from alembic import op
import sqlalchemy as sa


revision = "036"
down_revision = "035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "kp_generation_jobs",
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
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'queued'"),
        ),
        sa.Column("template_key", sa.String(40), nullable=False),
        sa.Column("tone", sa.String(20), nullable=False, server_default=sa.text("'neutral'")),
        sa.Column("custom_sender_profile", sa.Text(), nullable=True),
        sa.Column(
            "company_ids",
            sa.dialects.postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("total", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("generated", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("failed", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("last_company_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "cancel_requested",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_check_constraint(
        "ck_kp_generation_jobs_status",
        "kp_generation_jobs",
        "status IN ('queued', 'running', 'done', 'cancelled', 'failed')",
    )
    op.create_index(
        "ix_kp_generation_jobs_user_created",
        "kp_generation_jobs",
        ["user_id", "created_at"],
    )
    op.create_index(
        "ix_kp_generation_jobs_status",
        "kp_generation_jobs",
        ["status"],
    )


def downgrade() -> None:
    op.drop_index("ix_kp_generation_jobs_status", table_name="kp_generation_jobs")
    op.drop_index("ix_kp_generation_jobs_user_created", table_name="kp_generation_jobs")
    op.drop_constraint(
        "ck_kp_generation_jobs_status", "kp_generation_jobs", type_="check"
    )
    op.drop_table("kp_generation_jobs")
