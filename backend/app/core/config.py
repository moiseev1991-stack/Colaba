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

    # Telegram Bot for outreach sending
    TELEGRAM_BOT_TOKEN: str = Field(default="", description="Telegram Bot API token for outreach")

    # Logging
    LOG_LEVEL: str = Field(default="INFO", description="Logging level")


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
