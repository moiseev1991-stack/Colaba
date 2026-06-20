"""kp_sends — отправки сгенерированных КП

Revision ID: 038
Revises: 037
Create Date: 2026-06-21

Раньше КП можно было только сгенерировать и скопировать руками. С этой
миграции на странице партии `/app/leads/kp-jobs/{id}` появляется
рабочая отправка по выбранным каналам — каждая попытка пишется в
kp_sends.

Один draft × один канал × одна попытка = одна строка. На «Отправить
всем» по партии из 75 компаний с двумя каналами создаётся 150 строк.

Статусы:
  queued / sending / sent / failed / skipped

job_id NULLable (SET NULL) — историю отправок не теряем, если bulk-job
позже удалится. company_id NULLable — same.

draft_id NOT NULL (CASCADE) — без draft'а нет смысла хранить факт его
отправки. Если draft удалили, отправка тоже исчезает.
"""

from alembic import op
import sqlalchemy as sa


revision = "038"
down_revision = "037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "kp_sends",
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
            "job_id",
            sa.BigInteger(),
            sa.ForeignKey("kp_generation_jobs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "draft_id",
            sa.BigInteger(),
            sa.ForeignKey("kp_drafts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "company_id",
            sa.BigInteger(),
            sa.ForeignKey("companies.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("recipient", sa.String(500), nullable=True),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'queued'"),
        ),
        sa.Column("error_code", sa.String(50), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("provider_message_id", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_check_constraint(
        "ck_kp_sends_status",
        "kp_sends",
        "status IN ('queued', 'sending', 'sent', 'failed', 'skipped')",
    )
    op.create_check_constraint(
        "ck_kp_sends_channel",
        "kp_sends",
        "channel IN ('email', 'telegram', 'whatsapp', 'max')",
    )
    op.create_index(
        "ix_kp_sends_user_created",
        "kp_sends",
        ["user_id", "created_at"],
    )
    op.create_index(
        "ix_kp_sends_job_id",
        "kp_sends",
        ["job_id"],
    )
    op.create_index(
        "ix_kp_sends_draft_id",
        "kp_sends",
        ["draft_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_kp_sends_draft_id", table_name="kp_sends")
    op.drop_index("ix_kp_sends_job_id", table_name="kp_sends")
    op.drop_index("ix_kp_sends_user_created", table_name="kp_sends")
    op.drop_constraint("ck_kp_sends_channel", "kp_sends", type_="check")
    op.drop_constraint("ck_kp_sends_status", "kp_sends", type_="check")
    op.drop_table("kp_sends")
