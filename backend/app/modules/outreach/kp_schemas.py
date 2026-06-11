"""Pydantic-схемы для KP-конвейера (Эпик A ТЗ 2026-06-12)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class KpTemplateOut(BaseModel):
    """Системный или организационный шаблон КП — для селекта в модалке."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    key: str
    title: str
    sender_profile: str
    offer_hint: str
    is_system: bool


class KpGenerateRequest(BaseModel):
    """Тело POST /outreach/kp/generate.

    Эпик F (2026-06-12): принимается ЛИБО company_id (КП по компании из maps),
    ЛИБО site_lead_id (КП по найденному сайту). Ровно одно из двух.
    """

    company_id: int | None = None
    site_lead_id: int | None = None
    template_key: str = Field(..., min_length=1, max_length=40)
    tone: Literal["neutral", "bold"] = "neutral"
    # custom-шаблон: юзер вводит профиль отправителя сам, фронт
    # подкладывает 1-2 предложения в это поле. Для системных шаблонов
    # игнорируется (берётся sender_profile из БД).
    custom_sender_profile: str | None = Field(default=None, max_length=600)

    @model_validator(mode="after")
    def _check_xor_target(self):
        has_company = self.company_id is not None
        has_site = self.site_lead_id is not None
        if has_company == has_site:
            # Оба или ни одного — оба варианта нарушают XOR.
            raise ValueError(
                "Нужно передать ровно одно: company_id или site_lead_id."
            )
        return self


class SiteLeadCreate(BaseModel):
    """Тело POST /outreach/site-leads — сохранить результат web-поиска
    как лид для будущей генерации КП. Эпик F."""

    query: str = Field(..., min_length=1, max_length=500)
    entry: str = Field(default="", max_length=500)
    url: str = Field(..., min_length=1, max_length=2000)
    title: str | None = Field(default=None, max_length=500)
    snippet: str | None = None
    # Опционально: ссылка на исходный web-search из существующего модуля
    # searches, если site-lead создаётся из результата поиска.
    search_id: int | None = None


class SiteLeadOut(BaseModel):
    """Ответ GET/POST /outreach/site-leads."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    search_id: int | None = None
    query: str
    entry: str
    url: str
    domain: str
    title: str | None = None
    snippet: str | None = None
    created_at: datetime


class KpArgumentsUsed(BaseModel):
    """Снимок входных данных для промпта — отдаётся обратно во фронт +
    хранится в kp_drafts.arguments_used JSONB. Сделан плоским, без
    nested-объектов, чтобы UI-блок «Аргументы» рендерился без условий.
    """

    pain_label: str | None = None
    quote: str | None = None
    mention_count: int | None = None
    trend: str | None = None  # rising/stable/falling/no_data
    trend_phrase: str | None = None  # человеческая фраза или ""
    benchmark_ratio: float | None = None
    benchmark_phrase: str | None = None
    source: str | None = None  # 2gis/yandex_maps/google — источник pain'а
    # Эпик F: поля для КП по сайту (заполнены, если КП сгенерирован
    # по SiteLead, а не по Company). UI-блок «Аргументы» рендерит их
    # вместо company-полей, если site_url задан.
    site_url: str | None = None
    site_domain: str | None = None
    entry: str | None = None
    entry_meaning: str | None = None
    sender_profile: str
    offer_hint: str
    tone: str
    template_key: str


class KpDraftOut(BaseModel):
    """Ответ POST /outreach/kp/generate."""

    id: int
    # Эпик F: либо company_id, либо site_lead_id заполнено (XOR).
    company_id: int | None = None
    site_lead_id: int | None = None
    template_key: str
    subject: str
    body: str
    arguments_used: KpArgumentsUsed
    # Эпик E ещё не реализован, всегда None. Фронт показывает счётчик
    # только когда != None — на старте просто скрыт.
    remaining_free: int | None = None
    created_at: datetime
