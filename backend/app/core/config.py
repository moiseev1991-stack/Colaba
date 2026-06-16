"""
Application configuration using Pydantic Settings.

Все настройки загружаются из environment variables через pydantic-settings.
"""

from functools import lru_cache
from typing import List, Union

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    ENVIRONMENT: str = Field(default="development", description="Environment (development, staging, production)")
    DEBUG: bool = Field(default=True, description="Debug mode")
    SECRET_KEY: str = Field(..., description="Secret key for JWT tokens")
    ALGORITHM: str = Field(default="HS256", description="JWT algorithm")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=30, description="Access token expiration in minutes")
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=7, description="Refresh token expiration in days")

    # Database
    DATABASE_URL: str = Field(..., description="Async PostgreSQL database URL")
    DATABASE_URL_SYNC: str = Field(default="", description="Sync PostgreSQL database URL (for Alembic)")

    # Redis
    REDIS_URL: str = Field(default="redis://localhost:6379/0", description="Redis URL")
    CELERY_BROKER_URL: str = Field(default="redis://localhost:6379/0", description="Celery broker URL")
    CELERY_RESULT_BACKEND: str = Field(default="redis://localhost:6379/0", description="Celery result backend URL")

    # CORS
    CORS_ORIGINS: str = Field(
        default="http://localhost:3000",
        description="Allowed CORS origins (comma-separated)",
    )
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS_ORIGINS string into a list."""
        if not self.CORS_ORIGINS:
            return []
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    # LLM
    OLLAMA_BASE_URL: str = Field(default="http://localhost:11434", description="Ollama base URL")
    OLLAMA_MODEL: str = Field(default="llama2", description="Default Ollama model")
    OPENAI_API_KEY: str = Field(default="", description="OpenAI API key (optional)")
    OPENAI_BASE_URL: str = Field(
        default="https://api.openai.com/v1",
        description="OpenAI API base URL. Override на https://api.proxyapi.ru/openai/v1 для работы из РФ.",
    )
    ANTHROPIC_API_KEY: str = Field(default="", description="Anthropic API key (optional)")
    ANTHROPIC_BASE_URL: str = Field(
        default="",
        description="Anthropic API base URL (override). Для работы из РФ — https://api.proxyapi.ru/anthropic",
    )

    # Proxy for HTML providers (Yandex, Google) — bypass blocks
    USE_PROXY: bool = Field(default=False, description="Use proxy for HTML search providers")

    @field_validator("USE_PROXY", mode="before")
    @classmethod
    def parse_use_proxy(cls, v: Union[bool, str]) -> bool:
        if v in (True, "true", "1", "yes"):
            return True
        if v in (False, "false", "0", "no", "", None):
            return False
        return bool(v)
    PROXY_URL: str = Field(default="", description="Single proxy: http://host:port or socks5://host:port")
    PROXY_LIST: str = Field(default="", description="Comma-separated proxy list for rotation")

    # External APIs
    SERPAPI_KEY: str = Field(default="", description="SerpAPI key (optional, deprecated)")
    YANDEX_XML_FOLDER_ID: str = Field(default="", description="Yandex Cloud: идентификатор каталога (yandex.cloud)")
    YANDEX_XML_KEY: str = Field(default="", description="Yandex Cloud: API-ключ сервисного аккаунта")

    # YooKassa payment gateway
    YOOKASSA_SHOP_ID: str = Field(default="", description="ЮКасса: идентификатор магазина (ShopId)")
    YOOKASSA_SECRET_KEY: str = Field(default="", description="ЮКасса: секретный ключ")
    YOOKASSA_RETURN_URL: str = Field(default="", description="ЮКасса: URL перенаправления после оплаты")

    # SMTP for outreach email sending
    SMTP_HOST: str = Field(default="", description="SMTP server hostname")
    SMTP_PORT: int = Field(default=465, description="SMTP server port")
    SMTP_USER: str = Field(default="", description="SMTP username / from address")
    SMTP_PASSWORD: str = Field(default="", description="SMTP password")
    SMTP_USE_SSL: bool = Field(default=True, description="Use SSL for SMTP connection")

    # Hyvor Relay - Email API Server
    HYVOR_RELAY_API_URL: str = Field(default="http://hyvor-relay:8000", description="Hyvor Relay API URL (internal Docker)")
    HYVOR_RELAY_API_KEY: str = Field(default="", description="Hyvor Relay API key for sending emails")
    HYVOR_RELAY_WEBHOOK_SECRET: str = Field(default="", description="Secret to verify Hyvor webhooks")
    HYVOR_RELAY_ENABLED: bool = Field(default=False, description="Use Hyvor Relay instead of direct SMTP")

    @field_validator("HYVOR_RELAY_ENABLED", mode="before")
    @classmethod
    def parse_hyvor_enabled(cls, v: Union[bool, str]) -> bool:
        if v in (True, "true", "1", "yes"):
            return True
        if v in (False, "false", "0", "no", "", None):
            return False
        return bool(v)

    # IMAP for receiving email replies
    IMAP_HOST: str = Field(default="", description="IMAP server hostname")
    IMAP_PORT: int = Field(default=993, description="IMAP server port")
    IMAP_USER: str = Field(default="", description="IMAP username")
    IMAP_PASSWORD: str = Field(default="", description="IMAP password")
    IMAP_USE_SSL: bool = Field(default=True, description="Use SSL for IMAP connection")
    IMAP_MAILBOX: str = Field(default="INBOX", description="IMAP mailbox to check")
    REPLY_PREFIX: str = Field(default="reply-", description="Prefix for reply-to email addresses (e.g., reply-123@domain.com)")

    # Telegram Bot for outreach sending
    TELEGRAM_BOT_TOKEN: str = Field(default="", description="Telegram Bot API token for outreach")

    # OAuth Providers
    GOOGLE_CLIENT_ID: str = Field(default="", description="Google OAuth Client ID")
    GOOGLE_CLIENT_SECRET: str = Field(default="", description="Google OAuth Client Secret")
    YANDEX_CLIENT_ID: str = Field(default="", description="Yandex OAuth Client ID")
    YANDEX_CLIENT_SECRET: str = Field(default="", description="Yandex OAuth Client Secret")
    VK_CLIENT_ID: str = Field(default="", description="VK ID Client ID")
    VK_CLIENT_SECRET: str = Field(default="", description="VK ID Client Secret")
    # Telegram Login Widget uses bot token above

    # OAuth Frontend URL (for redirects)
    OAUTH_FRONTEND_URL: str = Field(default="http://localhost:4000", description="Frontend URL for OAuth callbacks")

    # === Maps module ===
    TWOGIS_API_KEY: str = Field(default="", description="2GIS Catalog API key (dev.2gis.com, free 1000 req/day)")
    TWOGIS_RATE_LIMIT_DELAY: float = Field(default=0.4, description="Delay (sec) between 2GIS requests, anti-throttle. На free-плане лимит 1000 req/day, поэтому 0.4с между запросами безопасно (≤150 req/min).")
    TWOGIS_REVIEWS_PUBLIC_API_ENABLED: bool = Field(default=True, description="Fallback на public-api.reviews.2gis.com (widget API, без платного ключа). False = только Catalog reviews/list (платно).")
    TWOGIS_REVIEWS_PUBLIC_API_KEY: str = Field(default="", description="Optional widget key для public-api.reviews.2gis.com. Пусто = пробуем без ключа (часто достаточно).")
    YANDEX_MAPS_RATE_LIMIT_DELAY: float = Field(default=3.5, description="Base delay (sec) between Yandex Maps requests; jittered ±1s in code")
    MAPS_CACHE_TTL_DAYS: int = Field(default=14, description="TTL (days) for map_search_cache per (niche, city, source)")
    MAPS_MAX_COMPANIES_PER_SEARCH: int = Field(default=200, description="Hard cap on companies parsed per search")
    MAPS_MAX_REVIEWS_PER_COMPANY: int = Field(default=100, description="Hard cap on reviews fetched per company")

    # === Reviews AI ===
    REVIEWS_AI_EMBEDDING_PROVIDER: str = Field(default="openai", description="Embedding provider: 'openai' | 'yandex'")
    REVIEWS_AI_EMBEDDING_MODEL: str = Field(default="text-embedding-3-small", description="OpenAI model name")
    REVIEWS_AI_SENTIMENT_ASSISTANT_NAME: str = Field(default="", description="ai_assistant.name для sentiment; пусто = auto-pick по подсказке 'haiku'")
    REVIEWS_AI_NAMING_ASSISTANT_NAME: str = Field(default="", description="ai_assistant.name для naming кластеров; пусто = auto-pick по подсказке 'sonnet'")
    REVIEWS_AI_OUTREACH_DRAFT_ASSISTANT_NAME: str = Field(default="", description="ai_assistant.name для генерации драфта холодного письма; пусто = auto-pick")
    REVIEWS_AI_COMPANY_DESCRIPTION_ASSISTANT_NAME: str = Field(default="", description="ai_assistant.name для AI-описания компании (блок 4C); пусто = reviews_ai_company_description")
    # Cosine similarity threshold для матчинга review→pain_tag.
    # 0.78 был слишком высоким: на 2968 отзывов «стоматология/Балашиха» с 2
    # кластерами match присвоил теги только 1 компании из 73 (юзер 2026-06-10).
    # Снижение до 0.55 — на нормализованных text-embedding-3-small это «явная
    # тематическая близость», ниже идёт уже шум. Можно гонять выше через env,
    # если будут ложные срабатывания.
    REVIEWS_AI_PAIN_MATCH_THRESHOLD: float = Field(default=0.55, description="Cosine similarity threshold для матчинга review→pain_tag")
    REVIEWS_AI_MIN_CLUSTER_SIZE: int = Field(default=8, description="HDBSCAN min_cluster_size")

    # DaData (блок 2 ТЗ 2026-06-02). Бесплатный тариф 10k запросов/день.
    # Получить ключи: https://dadata.ru/ → личный кабинет → API.
    DADATA_API_KEY: str = Field(default="", description="DaData API key (Authorization: Token ...)")
    DADATA_SECRET_KEY: str = Field(default="", description="DaData Secret key (X-Secret: ...)")
    DADATA_BASE_URL: str = Field(
        default="https://suggestions.dadata.ru/suggestions/api/4_1/rs",
        description="DaData base URL",
    )

    # Logging
    LOG_LEVEL: str = Field(default="INFO", description="Logging level")

    # Sentry — error tracking. Пусто = выключен (no-op). Чтобы включить —
    # положить DSN в env. Прод-проект: https://sentry.io/ → settings → DSN.
    SENTRY_DSN: str = Field(default="", description="Sentry DSN; пусто = выключен")
    SENTRY_TRACES_SAMPLE_RATE: float = Field(
        default=0.05,
        description="Доля транзакций для performance-мониторинга (0..1). 0.05 = 5%.",
    )
    SENTRY_PROFILES_SAMPLE_RATE: float = Field(
        default=0.0,
        description="Доля профилирования (0..1). 0 = выкл, free-tier не тянет.",
    )

    # SQLAdmin session secret. По умолчанию падает обратно на SECRET_KEY (JWT),
    # но рекомендуется отдельный сложный ключ для production.
    ADMIN_SESSION_SECRET: str = Field(
        default="",
        description="Session signing key для SQLAdmin cookie. Пусто = fallback на SECRET_KEY.",
    )


@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance.
    
    Returns:
        Settings: Application settings instance
    """
    return Settings()


# Global settings instance
settings = get_settings()
