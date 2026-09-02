"""InboundLead — входящая заявка на бесплатный разбор потерь клиентов.

Единый приёмник для двух источников (ТЗ 2026-09-01):
  source="tg_bot"      — лид написал Telegram-боту-приёмнику по ссылке
                         t.me/<bot>?start=<payload>;
  source="landing_form" — лид оставил форму на лендинге spinlid-team.ru.

Оба пути шлют POST /api/v1/inbound-leads (защищён X-Inbound-Secret). Заявка
одновременно уходит владельцу в TG-личку, на почту и показывается в админке.

Дедуп по tg_user_id: повторные сообщения того же пользователя не создают
новую заявку, а дописываются в raw_messages последней открытой заявки.

matched_company_id — попытка сматчить company_text с таблицей companies
(по названию/ссылке 2ГИС-Я.Карт), чтобы в уведомлении сразу были боли
компании — готовый разбор.

Статусы: new → in_progress → replied → closed.
"""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class InboundLead(Base):
    __tablename__ = "inbound_leads"

    id = Column(Integer, primary_key=True)

    source = Column(String(20), nullable=False)          # 'tg_bot' | 'landing_form'
    source_tag = Column(String(120), nullable=False, default="")  # start payload / utm_source

    # Telegram-идентификаторы (только для source='tg_bot'). tg_user_id —
    # BigInteger: реальные Telegram user id уже выходят за int32.
    tg_user_id = Column(BigInteger, nullable=True, index=True)
    tg_username = Column(String(64), nullable=True)

    name = Column(String(255), nullable=False, default="")
    company_text = Column(Text, nullable=False, default="")   # что прислал лид: название/ссылка
    contact_text = Column(Text, nullable=False, default="")   # телефон/username/«пишите сюда»

    # Полная лента входящих сообщений: [{"at": iso, "text": "..."}]. При
    # повторных сообщениях дописывается, а не перезаписывается.
    raw_messages = Column(JSONB, nullable=False, default=list)

    status = Column(String(20), nullable=False, default="new")  # new/in_progress/replied/closed

    # True после первого «полного» уведомления владельцу. Нужно, чтобы бот-диалог
    # (пустой /start → компания → контакт) уведомлял ровно один раз — когда заявка
    # стала осмысленной, а дальнейшие сообщения слал как «дополнение».
    owner_notified = Column(Boolean, nullable=False, default=False)

    matched_company_id = Column(
        BigInteger,
        ForeignKey("companies.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    created_at = Column(DateTime(timezone=False), default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=False),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    __table_args__ = (
        Index("ix_inbound_leads_created_at", "created_at"),
        Index("ix_inbound_leads_status", "status"),
    )

    def __repr__(self) -> str:
        return (
            f"<InboundLead #{self.id} {self.source} "
            f"company={self.company_text[:40]!r} status={self.status!r}>"
        )
