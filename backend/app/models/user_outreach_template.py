"""Пользовательский шаблон письма для outreach.

Соответствует миграции 043. Аналог UserFilterPreset по структуре —
scope=per-user, каждый видит только свои. organization_id хранится pro
futuro для командного шеринга, сейчас в выборке не участвует.

Раньше фронт-сервис outreachTemplates.ts стучался в несуществующий
роут /outreach/templates и работал через localStorage-фолбэк, из-за чего
«сохранённые шаблоны» жили только в браузере и терялись при очистке.
Эта модель + templates_router/service делают их персистентными.

Контракт полей совпадает с фронт-типом OutreachTemplate:
    { id, name, subject, body, module, is_default?, created_at, updated_at }
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
    UniqueConstraint,
)

from app.core.database import Base


class UserOutreachTemplate(Base):
    """Пользовательский шаблон outreach-письма (subject + body)."""

    __tablename__ = "user_outreach_templates"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "name",
            name="uq_user_outreach_tpl_user_name",
        ),
    )

    id = Column(BigInteger, primary_key=True)
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
    )

    # Имя шаблона (уникально в рамках пользователя).
    name = Column(String(100), nullable=False)
    # Тема письма.
    subject = Column(String(500), nullable=False)
    # Тело письма (plain text / markdown — фронт решает как рендерить).
    body = Column(Text, nullable=False)
    # Модуль-источник: 'seo', 'leads', 'tenders', ... Дефолт 'seo' —
    # фронт-сервис outreachTemplates.ts шлёт именно его.
    module = Column(String(50), nullable=False, default="seo")

    # Дефолтный шаблон пользователя (показывается первым в списке).
    is_default = Column(Boolean, nullable=False, default=False)

    # 2026-07-14: привязка к боли — на /app/pains для выбранной боли
    # предлагаются шаблоны с этим pain_key + универсальные (NULL).
    # Значения — из PAIN_KEYS (call_no_answer, schedule_hard, admin_rude, ...).
    pain_key = Column(String(64), nullable=True, index=True)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<UserOutreachTemplate #{self.id} {self.name!r} "
            f"module={self.module!r} user={self.user_id}>"
        )
