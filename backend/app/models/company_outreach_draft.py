"""Кэш сгенерированных LLM-писем для холодного аутрича по компаниям.

Миграция 023. Уникальность (company_id, angle) — на каждый угол услуги один
актуальный draft. Регенерация перезаписывает запись (upsert).

Поле `pains_used` хранит массив объектов вида
    [{"pain_tag_id": 12, "label": "Долгое ожидание", "quote_review_id": 456,
      "similarity": 0.871}, ...]
чтобы UI мог подсветить какие именно боли пошли в письмо и поднять отзыв
по `quote_review_id`.
"""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class CompanyOutreachDraft(Base):
    __tablename__ = "company_outreach_drafts"
    __table_args__ = (
        UniqueConstraint(
            "company_id", "angle",
            name="uq_company_outreach_drafts_company_angle",
        ),
    )

    id = Column(BigInteger, primary_key=True)
    company_id = Column(
        BigInteger,
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Конкретный угол (auto на этом уровне уже резолвнут):
    # 'website' | 'reputation' | 'automation' | 'seo'.
    angle = Column(String(32), nullable=False)
    subject = Column(String(500), nullable=False)
    body = Column(Text, nullable=False)
    pains_used = Column(JSONB, nullable=True)
    tone = Column(String(16), nullable=False, default="friendly")
    language = Column(String(8), nullable=False, default="ru")
    model_used = Column(String(64), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<CompanyOutreachDraft #{self.id} company={self.company_id} "
            f"angle={self.angle!r}>"
        )
