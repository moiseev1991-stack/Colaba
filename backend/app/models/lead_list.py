"""Списки лидов: пользовательские сохранённые карточки компаний из maps-поиска
для последующей отправки в outreach-кампанию.

Соответствует миграции 018.
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
)
from sqlalchemy.orm import relationship

from app.core.database import Base


class LeadList(Base):
    """Пользовательский список лидов.

    source = 'maps' | 'sites' | 'manual' — откуда пришли карточки. Сейчас
    реально используется только 'maps' (карточки из 2GIS / Я.Карт). 'sites'
    и 'manual' зарезервированы под будущее.

    items_count — кэшированное количество строк lead_list_items, чтобы UI
    не дёргал COUNT при отрисовке списка списков. Поддерживается сервисом.
    """

    __tablename__ = "lead_lists"

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    organization_id = Column(
        Integer,
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    name = Column(String(200), nullable=False)
    description = Column(Text)
    source = Column(String(20), nullable=False, default="maps")

    items_count = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    items = relationship(
        "LeadListItem",
        back_populates="lead_list",
        cascade="all, delete-orphan",
        lazy="raise",
    )

    def __repr__(self) -> str:
        return f"<LeadList #{self.id} {self.name!r} items={self.items_count}>"


class LeadListItem(Base):
    """Связка список ↔ компания."""

    __tablename__ = "lead_list_items"

    lead_list_id = Column(
        Integer,
        ForeignKey("lead_lists.id", ondelete="CASCADE"),
        primary_key=True,
    )
    company_id = Column(
        BigInteger,
        ForeignKey("companies.id", ondelete="CASCADE"),
        primary_key=True,
    )
    added_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    notes = Column(Text)

    lead_list = relationship("LeadList", back_populates="items")
    company = relationship("Company")

    def __repr__(self) -> str:
        return f"<LeadListItem list={self.lead_list_id} company={self.company_id}>"
