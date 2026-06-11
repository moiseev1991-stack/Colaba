"""Пользовательский сохранённый набор фильтров.

Соответствует миграции 020. На MVP scope=per-user — каждый видит только
свои. organization_id хранится для будущего шеринга в рамках команды,
сейчас не используется при выборке.

Встроенные пресеты («Кризис репутации», «Падение рейтинга», «Нужен сайт»,
«Хаос в работе», «Стабильный») живут в коде frontend (MapsFiltersPanel.tsx)
и в эту таблицу не дублируются — они доступны всем, удалить их нельзя.
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
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class UserFilterPreset(Base):
    """Пользовательский пресет фильтров для поиска лидов."""

    __tablename__ = "user_filter_presets"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "module", "name",
            name="uq_user_filter_presets_user_module_name",
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

    # Модуль, к которому применим пресет: 'maps' (сейчас), 'searches', 'tenders'
    # (на будущее). Один и тот же пресет для разных модулей не имеет смысла,
    # поэтому unique включает module.
    module = Column(String(20), nullable=False, default="maps")
    name = Column(String(100), nullable=False)
    description = Column(Text)

    # Сериализованный MapSearchFilter (или аналог для других модулей).
    # Сохраняем только заполненные поля — exclude_none при сериализации
    # на API-слое.
    filter = Column(JSONB, nullable=False)

    # Скрытые пресеты не показываются в основной панели — только на вкладке
    # «Скрытые». Удобно убрать с глаз неактуальные сейчас, но не удалять
    # окончательно. Миграция 021.
    hidden = Column(Boolean, nullable=False, default=False)

    # Опциональный LLM-промпт для AI-анализа компаний под этот пресет.
    # При применении пресета с непустым ai_prompt — для каждой компании
    # выдачи запускается analyze_company_with_prompt, результат показывается
    # как бейдж «AI: N/10» в карточке. Кэшируется по hash промпта в
    # company_ai_analyses (миграция 022).
    ai_prompt = Column(Text)

    # Системный пресет (создан миграцией, юзер удалить не может).
    # Миграция 033. Сидируется отдельной миграцией Эпика C — те самые
    # «Для веб-студий / SEO / маркетологов», которые подсвечиваются
    # chips над выдачей. Юзерские пресеты создаются с is_system=False.
    is_system = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<UserFilterPreset #{self.id} {self.name!r} module={self.module!r} user={self.user_id}>"
