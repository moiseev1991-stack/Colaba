"""
SearchProviderConfig — настройки провайдеров поиска в БД (глобальные, один набор на инстанс).
"""

from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base


class SearchProviderConfig(Base):
    """Настройки провайдера поиска. provider_id: duckduckgo, yandex_html, google_html, yandex_xml, serpapi."""

    __tablename__ = "search_provider_config"

    id = Column(Integer, primary_key=True, index=True)
    provider_id = Column(String(64), unique=True, nullable=False, index=True)
    config = Column(JSONB, default=dict, nullable=False)  # use_proxy, proxy_url, api_key, use_mobile, ...
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
