"""Map provider configuration (singleton per provider_id).

Хранит настройки 3 провайдеров карт/отзывов: 2GIS, Yandex Maps, Google Maps.
Аналог EmailConfig по паттерну, но одна строка на провайдер (unique provider_id).

Ключи читаются провайдерами через providers_settings_service.load_provider_keys()
с fallback на env (TWOGIS_API_KEY, SERPAPI_KEY, ...) — обратная совместимость
с .env-настройкой сохраняется.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, Boolean, Text, String, Integer

from app.core.database import Base


class MapProviderConfig(Base):
    """Singleton-per-provider конфиг источников карт.

    provider_id ∈ {"twogis", "yandex_maps", "google_maps"}.

    Назначение полей зависит от провайдера:
    - twogis:         api_key = Catalog API ключ (https://dev.2gis.ru)
                      secondary_key = Widget public-api.reviews.2gis.com key
    - yandex_maps:    api_key пустой (HTML-парсер через Playwright)
                      secondary_key = опц. коммерческий Yandex Maps API ключ
    - google_maps:    api_key = SerpAPI ключ (https://serpapi.com)
                      secondary_key не используется
    """

    __tablename__ = "map_provider_config"

    id = Column(Integer, primary_key=True, index=True)
    provider_id = Column(String(32), unique=True, nullable=False, index=True)

    # Catalog / SerpAPI / коммерческий ключ (зависит от провайдера).
    api_key = Column(String(255), nullable=True)
    # Widget key (2GIS) или коммерческий Yandex Maps API ключ.
    secondary_key = Column(String(255), nullable=True)

    # Включён ли провайдер для использования в новых поисках.
    is_enabled = Column(Boolean, nullable=False, default=False, server_default="false")
    # Есть ли минимально-достаточный набор ключей для работы провайдера.
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
        return f"MapProviderConfig [{self.provider_id}] enabled={self.is_enabled}"

    def __repr__(self):
        return self.__str__()
