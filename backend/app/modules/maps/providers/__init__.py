"""Провайдеры карт: 2GIS, Я.Карты.

См. base.py — единый интерфейс MapProvider + типы исключений.
"""

from app.modules.maps.providers.base import (
    CaptchaWallError,
    MapProvider,
    MissingAPIKeyError,
    RateLimitError,
)

__all__ = [
    "MapProvider",
    "MissingAPIKeyError",
    "CaptchaWallError",
    "RateLimitError",
]
