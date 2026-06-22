"""WebsiteLead — заявка с публичных SEO-лендингов spinlid.ru.

В отличие от SiteLead (сохранённый авторизованным юзером результат
веб-поиска под КП), WebsiteLead — это анонимный лид от посетителя
сайта: «оставь имя + контакт → перезвоним с бесплатным тестом и
скидкой первым». Никакой авторизации, форма доступна всем.

Поля минимальные:
  name        — имя или ник (юзер может оставить псевдоним)
  channel     — выбранный способ связи: email / phone / whatsapp /
                telegram / max
  contact     — собственно сам контакт (телефон/email/username) — что
                ввёл юзер. Валидация по `channel` на бэке.
  wish        — опциональное пожелание/комментарий
  source_page — URL/путь страницы откуда пришла заявка (для аналитики)
  ip          — IP отправителя (для rate-limit и антиспам разборок)
  user_agent  — UA для аналитики/антиспам

Статусы:
  new        — только пришла, ещё не разобрана
  contacted  — с лидом связались
  qualified  — лид качественный, в работе
  spam       — мусор, не показывать в админке по умолчанию

Soft-delete: `deleted_at` — чтобы спам можно было «удалить» без потери
истории (антиспам-метки и rate-limit по IP сохраняются).
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, Index, Integer, String, Text

from app.core.database import Base


class WebsiteLead(Base):
    __tablename__ = "website_leads"

    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False, default="")
    channel = Column(String(20), nullable=False)
    contact = Column(String(255), nullable=False)
    wish = Column(Text, nullable=False, default="")
    source_page = Column(String(500), nullable=False, default="")
    referrer = Column(String(500), nullable=False, default="")
    ip = Column(String(64), nullable=False, default="")
    user_agent = Column(String(500), nullable=False, default="")
    status = Column(String(20), nullable=False, default="new")
    created_at = Column(
        DateTime(timezone=False),
        default=datetime.utcnow,
        nullable=False,
    )
    deleted_at = Column(DateTime(timezone=False), nullable=True)

    __table_args__ = (
        Index("ix_website_leads_created_at", "created_at"),
        Index("ix_website_leads_status", "status"),
    )

    def __repr__(self) -> str:
        return (
            f"<WebsiteLead #{self.id} {self.channel}={self.contact!r} "
            f"status={self.status!r}>"
        )
