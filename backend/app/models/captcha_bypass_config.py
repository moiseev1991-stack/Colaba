"""
CaptchaBypassConfig — настройки обхода капчи: AI-ассистент для картинок, 2captcha/anti-captcha.
Один конфиг на инстанс (один ряд в таблице или lazy init).
"""

from datetime import datetime

from sqlalchemy import Column, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class CaptchaBypassConfig(Base):
    """
    Конфиг обхода капчи.
    ai_assistant_id — для image captcha через AI Vision (nullable).
    external_services — {"2captcha": {"enabled": bool, "api_key": str}, "anticaptcha": {...}}.
    """

    __tablename__ = "captcha_bypass_config"

    id = Column(Integer, primary_key=True, index=True)
    ai_assistant_id = Column(Integer, ForeignKey("ai_assistant.id", ondelete="SET NULL"), nullable=True, index=True)
    external_services = Column(JSONB, default=dict, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
