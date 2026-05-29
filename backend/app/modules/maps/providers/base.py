"""Базовый интерфейс провайдера карты.

Конкретные провайдеры (2gis.py, yandex_maps.py) наследуются от MapProvider
и реализуют search_companies / fetch_reviews как async-генераторы.

Исключения:
- MissingAPIKeyError — ключ не настроен; сервис ставит status='failed', error_type='missing_key'
- CaptchaWallError    — упёрлись в капчу N раз; status='failed', error_type='captcha_wall'
- RateLimitError      — затроттлили; задача может быть переотправлена с backoff
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import AsyncIterator

from app.modules.maps.schemas import CompanyRaw, ReviewRaw


class MapProvider(ABC):
    """Интерфейс провайдера карты.

    Атрибут `source_name` — короткий идентификатор источника, который пишется
    в companies.source и reviews.source: '2gis' или 'yandex_maps'.
    """

    source_name: str

    @abstractmethod
    async def search_companies(
        self,
        niche: str,
        city: str,
        limit: int = 100,
        *,
        point: tuple[float, float] | None = None,
        radius_meters: int | None = None,
    ) -> AsyncIterator[CompanyRaw]:
        """Стримит компании по нише.

        Режимы:
        - city: использует city, ищет по region_id (если поддерживается).
        - radius: point=(lat,lng) + radius_meters > 0 — конкурентный режим,
          ищет компании в радиусе вокруг точки.

        Реализуется через `async def ... yield`. Может уйти спать между батчами
        для соблюдения rate limit — это нормально.
        """
        raise NotImplementedError

    @abstractmethod
    async def fetch_reviews(
        self,
        company_external_id: str,
        limit: int = 100,
    ) -> AsyncIterator[ReviewRaw]:
        """Стримит отзывы конкретной компании из этого источника."""
        raise NotImplementedError


class MissingAPIKeyError(RuntimeError):
    """Провайдер требует API-ключ, но он не задан в Settings."""


class CaptchaWallError(RuntimeError):
    """Провайдер встал в капчу N раз подряд, и обход не сработал."""


class RateLimitError(RuntimeError):
    """Получен 429 / эквивалент. Сервис может повторить с экспоненциальным backoff."""
