"""Channel configuration (singleton per channel_id).

Хранит настройки каналов рассылки помимо email:
- telegram — Telegram Bot API (warm-бот, шлёт тем кто нажал /start)
- whatsapp — GreenAPI (неофициальный WhatsApp Business API)
- max      — мессенджер MAX от VK (early-stage, заглушка до выхода API)

Аналог EmailProviderConfig по паттерну (singleton-per-channel_id).
Конфиги гибкие — разные схемы хранятся в JSONB-поле config.

Структура config по каналам:
- telegram: {bot_token, bot_username, welcome_message, cost_per_message}
- whatsapp: {api_url, instance_id, api_token, cost_per_message}
- max:      {cost_per_message, status: "coming_soon"}

Цена cost_per_message используется api_call_log для расчёта стоимости
(по аналогии с email_provider_config.cost_per_mail).
"""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class ChannelConfig(Base):
    """Singleton-per-channel конфиг канала рассылки (кроме email)."""

    __tablename__ = "channel_config"

    id = Column(Integer, primary_key=True, index=True)
    channel_id = Column(String(32), unique=True, nullable=False, index=True)
    # 'telegram' | 'whatsapp' | 'max'

    # Гибкое хранилище кредентиалов под разные каналы (см. docstring).
    config = Column(JSONB, nullable=False, default=dict)

    # Включён ли канал для КП-рассылок.
    enabled = Column(Boolean, nullable=False, default=False, server_default="false")
    # Минимально-достаточный набор кредентиалов.
    is_configured = Column(Boolean, nullable=False, default=False, server_default="false")

    last_test_at = Column(DateTime, nullable=True)
    last_test_result = Column(String(50), nullable=True)
    last_test_error = Column(Text, nullable=True)

    notes = Column(Text, nullable=True)

    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
    created_at = Column(
        DateTime, default=datetime.utcnow, nullable=False, server_default="now()"
    )

    def __str__(self):
        return (
            f"ChannelConfig [{self.channel_id}] "
            f"enabled={self.enabled} configured={self.is_configured}"
        )

    def __repr__(self):
        return self.__str__()
