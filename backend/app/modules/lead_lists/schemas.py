"""Pydantic-схемы модуля lead_lists."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.maps.schemas import CompanyOut


LeadListSource = Literal["maps", "sites", "manual"]


class LeadListCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    source: LeadListSource = "maps"


class LeadListUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)


class LeadListOut(BaseModel):
    """Карточка списка для GET /lead-lists."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    source: str
    items_count: int = 0
    created_at: datetime
    updated_at: datetime


class LeadListDetailOut(LeadListOut):
    """Детали списка с подгруженными компаниями (страница списков)."""

    items: list[CompanyOut] = Field(default_factory=list)


class LeadListItemsAddIn(BaseModel):
    """Добавить компании в список (bulk)."""

    model_config = ConfigDict(extra="ignore")

    company_ids: list[int] = Field(..., min_length=1, max_length=500)


class LeadListItemsAddOut(BaseModel):
    """Результат bulk-добавления."""

    added: int
    already_in_list: int
    not_found: int
    items_count: int


class CreateCampaignFromListIn(BaseModel):
    """Тело POST /lead-lists/{id}/create-campaign."""

    model_config = ConfigDict(extra="ignore")

    name: str = Field(..., min_length=1, max_length=200)
    subject: str = Field(..., min_length=1, max_length=500)
    body: str = Field(..., min_length=1)
    template_id: int | None = None
    domain_id: int | None = None
    from_email: str | None = Field(default=None, max_length=255)
    from_name: str | None = Field(default=None, max_length=255)
    reply_to_email: str | None = Field(default=None, max_length=255)
    # Если True — auto-personalize: подставить {company_name}, {city}, {top_pain},
    # {pain_quote} из карточки компании / её топ-боли. В EmailLog уже летят
    # подставленные значения.
    auto_personalize: bool = True


class CreateCampaignFromListOut(BaseModel):
    """Результат создания кампании из списка."""

    campaign_id: int
    total_recipients: int
    skipped_no_email: int


class BulkDraftItem(BaseModel):
    """Один драфт в bulk-результате."""

    model_config = ConfigDict(extra="ignore")

    company_id: int
    company_name: str
    subject: str
    body: str
    used_pain_label: str | None = None
    used_pain_quote: str | None = None
    suggested_to_emails: list[str] = []


class BulkDraftsOut(BaseModel):
    """Ответ POST /lead-lists/{id}/bulk-drafts."""

    model_config = ConfigDict(extra="ignore")

    list_id: int
    total_companies: int
    drafts: list[BulkDraftItem] = []
    skipped_no_pains: int = 0
    skipped_llm_error: int = 0
