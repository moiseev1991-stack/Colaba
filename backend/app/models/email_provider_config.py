"""Email provider configuration (singleton per provider_id).

Хранит настройки 3 каналов отправки email:
- postbox — Yandex Cloud Postbox (основной)
- ses     — Amazon SES (резервный)
- hyvor   — Hyvor Relay, собственный self-hosted сервер

Аналог MapProviderConfig по паттерну: одна строка на провайдер
(unique provider_id). Заменяет бинарный выбор EmailConfig.provider_type
{'hyvor','smtp'} на цепочку с приоритетами и авто-fallback.

Назначение полей зависит от провайдера:
- postbox: smtp_host/port/user/password + from_email/name. SMTP-интерфейс
           Yandex Cloud Postbox (postbox.cloud.yandex.net:587 STARTTLS).
- ses:     smtp_host/port/user/password + region. SMTP-интерфейс Amazon SES
           (email-smtp.{region}.amazonaws.com:587). smtp_user/smtp_password
           — IAM SMTP-кредентиалы (создаются в AWS Console).
- hyvor:   smtp_host = API URL (http://hyvor-relay:8000); api_key — Bearer;
           secret_key — webhook secret. HTTP-API вместо SMTP.

cost_per_mail — цена отправки одного письма в рублях, задаётся админом
через UI. Используется трекером api_call_log для расчёта стоимости
исходящей рассылки. НЕ из provider_pricing.py (там только maps/LLM/captcha).
"""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Integer,
    Numeric,
    String,
    Text,
)

from app.core.database import Base


class EmailProviderConfig(Base):
    """Singleton-per-provider конфиг канала отправки email."""

    __tablename__ = "email_provider_config"

    id = Column(Integer, primary_key=True, index=True)
    provider_id = Column(String(32), unique=True, nullable=False, index=True)

    # Секреты — Text (без лимита): встречаются JWT, длинные base64-blobs.
    api_key = Column(Text, nullable=True)
    secret_key = Column(Text, nullable=True)
    # Прочие строки — widen до 2048 на случай длинных hosts/emails/regions.
    smtp_host = Column(String(2048), nullable=True)
    smtp_port = Column(Integer, nullable=True)
    smtp_user = Column(String(2048), nullable=True)
    smtp_password = Column(Text, nullable=True)
    smtp_use_ssl = Column(Boolean, nullable=False, default=False, server_default="false")
    from_email = Column(String(2048), nullable=True)
    from_name = Column(String(2048), nullable=True)
    region = Column(String(2048), nullable=True)

    # Стоимость отправки одного письма в рублях — задаётся админом в UI.
    # Трекер api_call_log.log_call(provider_id, amount_rub=cost_per_mail)
    # использует это значение для расчёта стоимости рассылки.
    cost_per_mail = Column(
        Numeric(10, 6), nullable=False, default=0, server_default="0"
    )

    # Включён ли канал для отправки (если False — skip в fallback-цепочке).
    is_enabled = Column(Boolean, nullable=False, default=False, server_default="false")
    # Есть ли минимально-достаточный набор кредентиалов.
    is_configured = Column(Boolean, nullable=False, default=False, server_default="false")

    # Приоритет в fallback-цепочке: 0 = основной, 1 = резервный, 2 = доп.
    # send_email() перебирает включённые провайдеры по возрастанию priority.
    priority = Column(Integer, nullable=False, default=0, server_default="0")

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
            f"EmailProviderConfig [{self.provider_id}] "
            f"enabled={self.is_enabled} priority={self.priority}"
        )

    def __repr__(self):
        return self.__str__()
