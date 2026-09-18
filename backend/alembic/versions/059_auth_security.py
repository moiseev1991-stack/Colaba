"""auth security: social_accounts unique, email_verified, auth_tokens

Revision ID: 059
Revises: 058

Аудит авторизации 18.09 (Этапы 0+3):
- social_accounts: unique(provider, provider_user_id) + индекс user_id
  (раньше гонка могла создать дубли привязки);
- users.email_verified — верификация email (соцвходы с verified email
  проставляют флаг сразу);
- auth_tokens — одноразовые токены: сброс пароля / подтверждение email
  (sha256-хеш, TTL, used_at).
"""

from alembic import op
import sqlalchemy as sa

revision = "059"
down_revision = "058"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # дедуп перед констрейнтом (если были дубли — оставляем первую)
    op.execute(
        """
        DELETE FROM social_accounts a
        USING social_accounts b
        WHERE a.id > b.id
          AND a.provider = b.provider
          AND a.provider_user_id = b.provider_user_id
        """
    )
    op.create_unique_constraint("uq_social_accounts_provider_uid", "social_accounts", ["provider", "provider_user_id"])
    op.create_index("ix_social_accounts_user_id", "social_accounts", ["user_id"])

    op.add_column(
        "users",
        sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    op.create_table(
        "auth_tokens",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("kind", sa.Enum("password_reset", "email_verify", name="auth_token_kind"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_auth_tokens_user_id", "auth_tokens", ["user_id"])
    op.create_index("ix_auth_tokens_token_hash", "auth_tokens", ["token_hash"])


def downgrade() -> None:
    op.drop_index("ix_auth_tokens_token_hash", table_name="auth_tokens")
    op.drop_index("ix_auth_tokens_user_id", table_name="auth_tokens")
    op.drop_table("auth_tokens")
    sa.Enum(name="auth_token_kind").drop(op.get_bind(), checkfirst=True)
    op.drop_column("users", "email_verified")
    op.drop_index("ix_social_accounts_user_id", table_name="social_accounts")
    op.drop_constraint("uq_social_accounts_provider_uid", "social_accounts", type_="unique")
