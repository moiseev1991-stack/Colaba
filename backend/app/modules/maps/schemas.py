"""Pydantic-схемы модуля maps.

Промежуточные схемы для провайдеров (CompanyRaw, ReviewRaw) — отдают
providers/*.py, читает service.save_*_batch. Out-схемы — для API.

NB: НЕ используем `from __future__ import annotations` — Pydantic + FastAPI
ломаются на ForwardRef в Query/Body. Python 3.11 нативно поддерживает
union-синтаксис без future-импорта.
"""

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

    # Текстовые фильтры по отзывам: компания включается в выдачу, только если
    # у неё есть хотя бы один отзыв, который ILIKE %contains% / NOT ILIKE %excludes%.
    review_text_contains: str | None = None
    review_text_excludes: str | None = None


# ---------------------------------------------------------------------------
# API request/response schemas
# ---------------------------------------------------------------------------


class MapSearchCreate(BaseModel):
    """Тело POST /api/v1/maps/search."""

    model_config = ConfigDict(extra="ignore")

    niche: str = Field(..., min_length=2, max_length=100)
    city: str = Field(..., min_length=2, max_length=100)
    sources: list[Source] = Field(default_factory=lambda: ["2gis"])
    filters: MapSearchFilter | None = None


class PainTagShort(BaseModel):
    id: int
    label: str
    similarity: float | None = None


class CompanyPainOut(BaseModel):
    """Боль с привязкой к конкретной компании: + mention_count + цитата.

    Используется в карточке компании, чтобы под каждой болью показать
    «доказательство» — короткий фрагмент отзыва клиента.
    """

    model_config = ConfigDict(from_attributes=True)

    pain_tag_id: int
    label: str
    description: str | None = None
    mention_count: int = 0
    top_quote: str | None = None
    top_quote_similarity: float | None = None


class PainTagOut(BaseModel):
    """Полная карточка тега боли для облака тегов / API."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    niche: str
    city: str | None = None
    label: str
    description: str | None = None
    occurrences_count: int = 0
    cluster_size: int | None = None
    examples: list[dict] | None = None
    status: str = "active"


class CompanyOut(BaseModel):
    """Карточка компании в выдаче. pain_tags пустой до ШАГов 7-11."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    niche: str | None = None
    city: str | None = None
    address: str | None = None
    phone: str | None = None
    website: str | None = None
    rating: float | None = None
    reviews_count: int = 0
    reviews_positive_count: int = 0
    reviews_negative_count: int = 0
    reviews_neutral_count: int = 0
    has_owner_replies: bool = False
    owner_replies_count: int = 0
    last_review_at: datetime | None = None
    source: str
    pain_tags: list[PainTagShort] = Field(default_factory=list)
    # Обогащённые контакты (миграция 018). Заполняются Celery-таском
    # enrich_company_contacts асинхронно — могут быть None на свежей компании.
    emails: list[str] | None = None
    contacts_extra: dict[str, Any] | None = None
    # Топ-боли с цитатами клиентов под каждой. Заполняется опционально
    # сервисом (attach_top_pains_for_companies) для маршрутов, где это нужно.
    top_pains: list[CompanyPainOut] = Field(default_factory=list)


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    author_masked: str | None = None
    rating: int | None = None
    raw_text: str | None = None
    sentiment: str | None = None
    sentiment_score: float | None = None
    posted_at: datetime | None = None
    has_owner_reply: bool = False
    source_url: str | None = None
    pain_tags: list[PainTagShort] = Field(default_factory=list)


class CompanyDetailOut(CompanyOut):
    recent_reviews: list[ReviewOut] = Field(default_factory=list)


class MapSearchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    niche: str
    city: str
    sources: str
    status: str
    ai_progress: str
    companies_found: int = 0
    reviews_found: int = 0
    error: str | None = None
    error_type: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None


class CompaniesListOut(BaseModel):
    items: list[CompanyOut]
    total: int
    limit: int
    offset: int


class ReviewsListOut(BaseModel):
    items: list[ReviewOut]
    total: int
    limit: int
    offset: int


class ProvidersHealthOut(BaseModel):
    twogis: str
    yandex_maps: str


class OutreachDraftOut(BaseModel):
    """Ответ POST /maps/companies/{id}/draft-email."""

    model_config = ConfigDict(extra="ignore")

    company_id: int
    company_name: str
    subject: str
    body: str
    used_pains: list[CompanyPainOut] = Field(default_factory=list)
    suggested_to_emails: list[str] = Field(default_factory=list)
