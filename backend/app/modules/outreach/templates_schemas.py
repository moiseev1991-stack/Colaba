"""Pydantic-схемы для пользовательских outreach-шаблонов.

Контракт полей совпадает с фронт-сервисом outreachTemplates.ts
(OutreachTemplate / OutreachTemplateCreate), чтобы фронт работал
без правок.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserOutreachTemplateCreate(BaseModel):
    """Тело POST /outreach/templates."""

    model_config = ConfigDict(extra="ignore")

    name: str = Field(..., min_length=1, max_length=100)
    subject: str = Field(..., min_length=1, max_length=500)
    body: str = Field(..., min_length=1)
    module: str = Field(default="seo", max_length=50)


class UserOutreachTemplateUpdate(BaseModel):
    """Тело PATCH /outreach/templates/{id}. Все поля опциональны —
    обновляется только переданное (None = не трогать)."""

    model_config = ConfigDict(extra="ignore")

    name: str | None = Field(default=None, min_length=1, max_length=100)
    subject: str | None = Field(default=None, min_length=1, max_length=500)
    body: str | None = None
    module: str | None = Field(default=None, max_length=50)
    is_default: bool | None = None


class UserOutreachTemplateOut(BaseModel):
    """Ответ API."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    subject: str
    body: str
    module: str
    is_default: bool = False
    created_at: datetime
    updated_at: datetime
