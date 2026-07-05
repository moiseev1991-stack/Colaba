"""Telegram subscriber — лид, нажавший /start на нашем боте.

Bot API НЕ позволяет писать пользователю, пока тот сам не инициировал
чат командой /start. Эта таблица — реестр таких пользователей: chat_id
получаем из webhook'а, дальше связываем с компанией по phone/email
(если юзер пошарил контакт через кнопку request_contact=True).

КП-конвейер (kp_send_service.collect_telegram_chat_ids) ищет по
company.phone → telegram_subscribers.phone (или по email) и проставляет
chat_id в KpSend.recipient. Если совпадения нет — chat_id можно ввести
вручную в UI (recipient_telegram).
"""

from datetime import datetime

from sqlalchemy import BigInteger, Column, DateTime, String

from app.core.database import Base


class TelegramSubscriber(Base):
    """Пользователь Telegram, стартовавший нашего бота (warm-channel)."""

    __tablename__ = "telegram_subscribers"

    id = Column(BigInteger, primary_key=True, index=True)
    # Числовой chat_id пользователя Telegram (он же recipient в KpSend).
    chat_id = Column(BigInteger, unique=True, nullable=False, index=True)
    # @username без @ (если есть; может быть None для юзеров без username).
    username = Column(String(64), nullable=True, index=True)
    # Имя (first_name из User в TG).
    first_name = Column(String(128), nullable=True)
    # Телефон в формате 79XXXXXXXXX (если юзер пошарил через request_contact).
    # Ключ связи с компанией: company.phone → telegram_subscribers.phone.
    phone = Column(String(20), nullable=True, index=True)
    # Email (если юзер ввёл в бот через reply-клавиатуру, опционально).
    email = Column(String(255), nullable=True, index=True)
    # Время последнего взаимодействия (для warm-up аналитики).
    last_interaction_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __str__(self):
        return f"TelegramSubscriber [{self.chat_id}] @{self.username or '?'} phone={self.phone}"

    def __repr__(self):
        return self.__str__()
