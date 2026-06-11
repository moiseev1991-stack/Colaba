"""Сгенерированный КП — холодное письмо лиду с цитатой из отзыва.

Миграция 033 (Эпик A фокус-релиза «КП-конвейер»). Каждая запись —
один акт генерации; перегенерация даёт новую запись (не перезапись),
чтобы юзер мог сравнить варианты и счётчик месячных лимитов
работал по COUNT'у (Эпик E).

arguments_used JSONB — снимок входных данных для промпта:
  - pain_label, top_quote, mention_count
  - trend ("rising"/"stable"/"falling") + период в месяцах
  - source отзыва (2gis/yandex_maps/google)
  - benchmark (во сколько раз чаще, чем в среднем по нише) — если данных нет, ключ опущен
  - sender_profile, offer_hint (на случай кастомного шаблона)

company_id NOT NULL пока. В миграции Эпика F (шаг 7 ТЗ) сюда
добавится `site_lead_id` (для КП на найденные web-search'ем сайты)
и company_id станет nullable + CHECK constraint.
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
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class KpDraft(Base):
    __tablename__ = "kp_drafts"

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
    # Миграция 034 (Эпик F): company_id стал nullable. KP может быть
    # либо по компании из maps (company_id заполнен), либо по найденному
    # сайту из web-search'а (site_lead_id заполнен). CHECK constraint
    # ck_kp_drafts_company_xor_site_lead гарантирует, что ровно одно
    # из двух заполнено.
    company_id = Column(
        BigInteger,
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=True,
    )
    site_lead_id = Column(
        BigInteger,
        ForeignKey("site_leads.id", ondelete="CASCADE"),
        nullable=True,
    )
    template_key = Column(String(40), nullable=False)
    subject = Column(String(500), nullable=False)
    body = Column(Text, nullable=False)
    arguments_used = Column(JSONB, nullable=False, default=dict)
    created_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<KpDraft #{self.id} user={self.user_id} company={self.company_id} "
            f"template={self.template_key!r}>"
        )
