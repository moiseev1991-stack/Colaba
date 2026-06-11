"""Шаблон КП — профиль отправителя для генерации холодного письма.

Миграция 033 (Эпик A фокус-релиза «КП-конвейер»). Системные шаблоны
сидируются миграцией, ключ глобально уникален среди системных. На
будущее предусмотрены кастомные шаблоны на уровне организации
(uq partial по organization_id, is_system=false) — фронт пока их
не создаёт.

`custom` — особый системный шаблон с пустым sender_profile. Текст
профиля для него юзер вводит в модалке и фронт подкладывает его
в тело запроса /outreach/kp/generate. В БД пустую строку оставляем
как заглушку, чтобы /outreach/kp/templates отдавал её в списке.
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

from app.core.database import Base


class KpTemplate(Base):
    __tablename__ = "kp_templates"

    id = Column(BigInteger, primary_key=True)
    key = Column(String(40), nullable=False)
    title = Column(String(120), nullable=False)
    sender_profile = Column(Text, nullable=False, default="")
    offer_hint = Column(Text, nullable=False, default="")
    is_system = Column(Boolean, nullable=False, default=True)
    organization_id = Column(
        Integer,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
    )
    created_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<KpTemplate #{self.id} {self.key!r} system={self.is_system}>"
