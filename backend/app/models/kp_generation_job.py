"""Bulk-job генерации КП по выделению (миграция 036).

Юзер из выдачи выбирает N компаний и жмёт «Сформировать КП для выбранных».
Сразу создаётся одна строка KpGenerationJob со списком company_ids; Celery
task `generate_kp_bulk_task` берёт её и итерирует, вызывая для каждой
существующий `generate_kp()`. На каждой итерации task обновляет счётчики
(generated/failed), `last_company_id` и проверяет `cancel_requested` — если
выставлен, выходит со статусом 'cancelled'.

UI поллит GET /outreach/kp/jobs/{id} и показывает прогресс + последние N
сгенерированных drafts (через JOIN kp_drafts WHERE created_at >= started_at
для этого user_id).
"""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class KpGenerationJob(Base):
    __tablename__ = "kp_generation_jobs"

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
    status = Column(String(20), nullable=False, default="queued")
    template_key = Column(String(40), nullable=False)
    tone = Column(String(20), nullable=False, default="neutral")
    custom_sender_profile = Column(Text, nullable=True)
    # 2026-07-12 миграция 050: универсальный dict под новые параметры
    # генерации (pain_tag_ids, use_4hods, channel, my_offer_step). NULL
    # для legacy-джоб — task тогда использует старые defaults.
    options = Column(JSONB, nullable=True)
    company_ids = Column(JSONB, nullable=False, default=list)
    total = Column(Integer, nullable=False, default=0)
    generated = Column(Integer, nullable=False, default=0)
    failed = Column(Integer, nullable=False, default=0)
    last_company_id = Column(BigInteger, nullable=True)
    cancel_requested = Column(Boolean, nullable=False, default=False)
    error_message = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        nullable=False,
    )
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return (
            f"<KpGenerationJob #{self.id} user={self.user_id} status={self.status} "
            f"{self.generated}/{self.total}>"
        )
