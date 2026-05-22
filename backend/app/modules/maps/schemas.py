"""Pydantic-схемы модуля maps.

Сейчас здесь — только промежуточные схемы для провайдеров (CompanyRaw, ReviewRaw):
их возвращают providers/*.py, их же читает service.save_*_batch.

Out-схемы для API (CompanyOut, MapSearchOut и т.д.) будут добавлены в ШАГе 5.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


Source = Literal["2gis", "yandex_maps"]


class CompanyRaw(BaseModel):
    """Сырые данные компании, отдаваемые провайдером карты.

    Все поля кроме source/external_id/name опциональны — провайдер может не отдать,
    например, координаты или сайт. Сервис нормализует и сохраняет в models.Company.
    """

    model_config = ConfigDict(extra="ignore")

    source: Source
    external_id: str
    name: str

    niche: str | None = None
    city: str | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    phone: str | None = None
    website: str | None = None

    rating: float | None = None
    reviews_count: int = 0

    raw_data: dict[str, Any] | None = Field(default=None, description="Полный ответ источника")


class ReviewRaw(BaseModel):
    """Сырой отзыв от провайдера. company_id заполняется сервисом перед save."""

    model_config = ConfigDict(extra="ignore")

    source: Source
    external_id: str | None = None
    author_masked: str | None = None
    rating: int | None = None
    raw_text: str | None = None
    source_url: str | None = None
    posted_at: datetime | None = None
    has_owner_reply: bool = False
