"""
Application configuration using Pydantic Settings.

Все настройки загружаются из environment variables через pydantic-settings.
"""

from functools import lru_cache
from typing import List

from pydantic import Field
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

    # External APIs
    SERPAPI_KEY: str = Field(default="", description="SerpAPI key (optional, deprecated - use YANDEX_XML)")
    YANDEX_XML_USER: str = Field(default="", description="Yandex XML API user ID (required for Yandex search)")
    YANDEX_XML_KEY: str = Field(default="", description="Yandex XML API key (required for Yandex search)")
    YANDEX_XML_URL: str = Field(
        default="https://yandex.com/search/xml",
        description="Yandex XML API endpoint URL (можно использовать сторонние прокси: xmlriver.com, xmlstock.com)"
    )

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
