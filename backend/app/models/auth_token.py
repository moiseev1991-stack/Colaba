"""Одноразовые токены аутентификации: сброс пароля / подтверждение email."""

from datetime import datetime

from sqlalchemy import BigInteger, Column, DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy import Integer as SaInteger

from app.core.database import Base

BigIntPK = BigInteger().with_variant(SaInteger, "sqlite")


class AuthToken(Base):
    __tablename__ = "auth_tokens"

    id = Column(BigIntPK, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(Enum("password_reset", "email_verify", name="auth_token_kind"), nullable=False)
    """sha256(token) hex — сырой токен живёт только в письме."""
    token_hash = Column(String(64), nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
