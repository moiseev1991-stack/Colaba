"""email conversation threads

Revision ID: 057
Revises: 056
Create Date: 2026-08-10

Новая таблица email_threads + колонки thread_id в email_logs/email_replies
для построения чат-мессенджера переписки с клиентами (RFC 5322 threading).

Thread = диалог с контактом по теме. Объединяет исходящие КП (email_logs) и
входящие ответы (email_replies) в единую переписку.

Backfill: для существующих email_replies создаём threads и связываем.
"""

import sqlalchemy as sa
from alembic import op

revision = "056"
down_revision = "055"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1) Новая таблица threads.
    op.create_table(
        "email_threads",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("contact_email", sa.String(255), nullable=False, index=True),
        sa.Column("contact_name", sa.String(255), nullable=True),
        sa.Column("subject", sa.String(500), nullable=True),
        sa.Column("last_message_at", sa.DateTime(), nullable=True),
        sa.Column("last_message_preview", sa.Text(), nullable=True),
        sa.Column("last_message_direction", sa.String(10), nullable=True),
        sa.Column("unread_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default="now()"),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_email_threads_user_contact",
        "email_threads",
        ["user_id", "contact_email"],
    )

    # 2) Колонки thread_id в существующих таблицах.
    op.add_column(
        "email_logs",
        sa.Column("thread_id", sa.Integer(), sa.ForeignKey("email_threads.id"), nullable=True),
    )
    op.create_index("ix_email_logs_thread_id", "email_logs", ["thread_id"])

    op.add_column(
        "email_replies",
        sa.Column("thread_id", sa.Integer(), sa.ForeignKey("email_threads.id"), nullable=True),
    )
    op.create_index("ix_email_replies_thread_id", "email_replies", ["thread_id"])
    op.add_column(
        "email_replies",
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default="false"),
    )

    # 3) Backfill: для каждого существующего ответа создаём thread.
    #    Нормализуем subject (убираем Re:/Fwd: префиксы) для группировки.
    op.execute(
        """
        INSERT INTO email_threads (user_id, contact_email, contact_name, subject,
                                   last_message_at, last_message_preview,
                                   last_message_direction, unread_count, created_at)
        SELECT DISTINCT ON (er.user_id, lower(er.from_email))
               er.user_id,
               lower(er.from_email),
               er.from_name,
               regexp_replace(regexp_replace(upper(er.subject), '^RE:\\s*', ''),
                              '^FWD:\\s*', '') AS subject,
               max(er.received_at) OVER (PARTITION BY er.user_id, lower(er.from_email)),
               (array_agg(er.body_text ORDER BY er.received_at DESC)
                  FILTER (WHERE er.body_text IS NOT NULL))[1],
               'incoming',
               1,
               now()
        FROM email_replies er
        WHERE er.user_id IS NOT NULL
        GROUP BY er.user_id, lower(er.from_email), er.from_name,
                 regexp_replace(regexp_replace(upper(er.subject), '^RE:\\s*', ''),
                                '^FWD:\\s*', '')
        ON CONFLICT DO NOTHING
        """
    )

    # 4) Связываем ответы с созданными threads.
    op.execute(
        """
        UPDATE email_replies er
        SET thread_id = sub.thread_id
        FROM (
            SELECT er2.id AS reply_id, t.id AS thread_id
            FROM email_replies er2
            JOIN email_threads t
              ON t.user_id = er2.user_id
             AND lower(t.contact_email) = lower(er2.from_email)
            WHERE er2.thread_id IS NULL
        ) sub
        WHERE er.id = sub.reply_id
        """
    )


def downgrade() -> None:
    op.drop_column("email_replies", "is_read")
    op.drop_index("ix_email_replies_thread_id", table_name="email_replies")
    op.drop_column("email_replies", "thread_id")
    op.drop_index("ix_email_logs_thread_id", table_name="email_logs")
    op.drop_column("email_logs", "thread_id")
    op.drop_index("ix_email_threads_user_contact", table_name="email_threads")
    op.drop_table("email_threads")
