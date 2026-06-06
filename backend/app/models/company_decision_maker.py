"""ЛПР компании, извлечённые со страниц сайта (ТЗ A.2 2026-06-04).

Миграция 032. Одна запись на (компанию, ФИО). Параллельная сущность
к CompanyLegal.director_name — там единственный руководитель из DaData,
здесь — все лица найденные на /team /о-нас /контакты.

is_decision_maker=True для ролей в whitelist (директор/владелец/...)
и фолбэк True для одиночного контакта (если на /контактах одно ФИО).
"""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Numeric,
    String,
)

from app.core.database import Base


class CompanyDecisionMaker(Base):
    __tablename__ = "company_decision_makers"

    id = Column(BigInteger, primary_key=True)
    company_id = Column(
        BigInteger,
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(200), nullable=False)
    post = Column(String(200), nullable=True)
    source = Column(String(40), nullable=False)  # website_team | website_about | website_contacts
    source_url = Column(String(1000), nullable=True)
    confidence = Column(Numeric(3, 2), nullable=False, default=0.5)
    is_decision_maker = Column(Boolean, nullable=False, default=True)
    created_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        nullable=False,
    )
