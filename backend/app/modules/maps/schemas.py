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


SortBy = Literal[
    "rating_asc",
    "rating_desc",
    "reviews_desc",
    "negative_desc",
    "pain_desc",
]


class MapSearchFilter(BaseModel):
    """Фильтры для get_search_results / списка компаний в API.

    pain_tag_ids — фильтр по AI-тегам болей; работает только после миграции 016
    (модуль reviews_ai). До миграции 016 фильтр игнорируется (NB не падает —
    просто молча не накладывается).
    """

    model_config = ConfigDict(extra="ignore")

    min_rating: float | None = None
    max_rating: float | None = None
    min_reviews: int | None = None
    min_negative: int | None = None
    has_owner_replies: bool | None = None
    pain_tag_ids: list[int] | None = None
    min_pain_mentions: int = 1
    sort_by: SortBy = "rating_desc"
