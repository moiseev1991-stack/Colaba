"""Кэш AI-анализа компании под кастомный промпт пользовательского пресета.

Миграция 022. Уникальность (company_id, prompt_hash, user_id) — повторный
запрос с тем же промптом к той же компании не идёт в ProxyAPI заново.
user_id в ключе — потому что разные юзеры могут иметь одинаковые промпты
независимо, и должен быть отдельный учёт квоты.

status: pending → done | failed
"""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)

from app.core.database import Base


class CompanyAiAnalysis(Base):
    __tablename__ = "company_ai_analyses"
    __table_args__ = (
        UniqueConstraint(
            "company_id", "prompt_hash", "user_id",
            name="uq_company_ai_analyses_company_prompt_user",
        ),
    )

    id = Column(BigInteger, primary_key=True)
    company_id = Column(
        BigInteger,
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    prompt_hash = Column(String(64), nullable=False)
    score = Column(Integer)
    comment = Column(Text)
    status = Column(String(20), nullable=False, default="pending")
    error = Column(Text)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<CompanyAiAnalysis #{self.id} company={self.company_id} "
            f"user={self.user_id} status={self.status!r} score={self.score}>"
        )
