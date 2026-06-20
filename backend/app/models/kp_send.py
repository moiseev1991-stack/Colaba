"""Отправка одной КП по конкретному каналу — строка истории отправок.

Миграция 038 (2026-06-21). Возникла, когда из bulk-страницы партии
`/app/leads/kp-jobs/{id}` добавили рабочую отправку по выбранным каналам.

Одна строка = одна попытка отправить один draft (kp_drafts.id) одному
адресату по одному каналу (email/telegram/whatsapp/max). Если юзер
выбрал на bulk-баре два канала — на каждый draft создаётся по две
строки KpSend.

Статусы:
  queued   — записан, ждёт worker'а.
  sending  — task взял и шлёт прямо сейчас.
  sent     — отдан провайдеру (Hyvor/SMTP — без webhook'а вебхук
             докрутит до 'delivered' в EmailLog'е отдельно).
  failed   — отправка упала (провайдер вернул ошибку, или таймаут).
  skipped  — у компании нет email/нет коннектора для этого канала.

Канал 'email' пока единственный реально работающий. TG/WA/MAX
создают строки с status='skipped' и reason='channel_unavailable'.
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

from app.core.database import Base


class KpSend(Base):
    __tablename__ = "kp_sends"

    id = Column(BigInteger, primary_key=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    organization_id = Column(
        Integer,
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
    )
    job_id = Column(
        BigInteger,
        ForeignKey("kp_generation_jobs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    draft_id = Column(
        BigInteger,
        ForeignKey("kp_drafts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    company_id = Column(
        BigInteger,
        ForeignKey("companies.id", ondelete="SET NULL"),
        nullable=True,
    )
    channel = Column(String(20), nullable=False)
    recipient = Column(String(500), nullable=True)
    status = Column(String(20), nullable=False, default="queued")
    error_code = Column(String(50), nullable=True)
    error_message = Column(Text, nullable=True)
    provider_message_id = Column(String(255), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        nullable=False,
    )
    sent_at = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return (
            f"<KpSend #{self.id} draft={self.draft_id} channel={self.channel!r} "
            f"status={self.status!r}>"
        )
