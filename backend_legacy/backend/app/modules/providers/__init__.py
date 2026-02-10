"""Модуль провайдеров поиска: реестр, сервис, API."""

from app.modules.providers.registry import PROVIDER_REGISTRY
from app.modules.providers.service import get_provider_config

__all__ = ["PROVIDER_REGISTRY", "get_provider_config"]
