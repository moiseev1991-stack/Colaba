"""
AiAssistant — конфигурация AI-моделей для вызовов (в т.ч. обход капчи, vision).
"""

from datetime import datetime

from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class AiAssistant(Base):
    """
    AI-ассистент: провайдер, модель, конфиг (api_key, base_url, ...).
    provider_type: openai, anthropic, google, mistral, ollama, groq, together,
    openrouter, azure_openai, xai, deepseek, other.
    """

    __tablename__ = "ai_assistant"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    provider_type = Column(String(64), nullable=False, index=True)
    model = Column(String(255), nullable=False)
    config = Column(JSONB, default=dict, nullable=False)
    supports_vision = Column(Boolean, default=False, nullable=False)
    is_default = Column(Boolean, default=False, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
