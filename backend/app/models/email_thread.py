"""Email conversation thread model.

Группирует переписку с одним контактом по одной теме (как чат в
мессенджере). Связывает исходящие КП (email_logs) и входящие ответы
(email_replies) через thread_id. См. RFC 5322 threading (Message-ID,
In-Reply-To, References) и Jamie Zawinski algorithm.
"""

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text

from app.core.database import Base


class EmailThread(Base):
    """Один диалог с контактом — как чат в мессенджере.

    Объединяет все письма (исходящие КП + входящие ответы + наши ответы
    на ответы) в единую переписку. Группировка по user_id + contact_email
    (+ нормализованная subject, чтобы разные темы одного контакта были
    разными тредами).
    """

    __tablename__ = "email_threads"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Контакт (клиент, с которым переписка).
    contact_email = Column(String(255), nullable=False, index=True)
    contact_name = Column(String(255), nullable=True)

    # Нормализованная тема (без Re:/Fwd: префиксов) — для группировки.
    subject = Column(String(500), nullable=True)

    # Кеш последнего сообщения (для списка тредов без JOIN'ов).
    last_message_at = Column(DateTime, nullable=True)
    last_message_preview = Column(Text, nullable=True)
    last_message_direction = Column(String(10), nullable=True)  # incoming/outgoing

    # Непрочитанные входящие (для бейджа в списке тредов).
    unread_count = Column(Integer, default=0, nullable=False)

    is_archived = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)

    def __str__(self):
        return f"Thread #{self.id} — {self.contact_email}"

    def __repr__(self):
        return self.__str__()
