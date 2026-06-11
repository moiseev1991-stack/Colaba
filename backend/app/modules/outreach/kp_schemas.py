"""Pydantic-схемы для KP-конвейера (Эпик A ТЗ 2026-06-12)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


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
    """Тело POST /outreach/kp/generate."""

    company_id: int
    template_key: str = Field(..., min_length=1, max_length=40)
    tone: Literal["neutral", "bold"] = "neutral"
    # custom-шаблон: юзер вводит профиль отправителя сам, фронт
    # подкладывает 1-2 предложения в это поле. Для системных шаблонов
    # игнорируется (берётся sender_profile из БД).
    custom_sender_profile: str | None = Field(default=None, max_length=600)


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
    sender_profile: str
    offer_hint: str
    tone: str
    template_key: str


class KpDraftOut(BaseModel):
    """Ответ POST /outreach/kp/generate."""

    id: int
    company_id: int
    template_key: str
    subject: str
    body: str
    arguments_used: KpArgumentsUsed
    # Эпик E ещё не реализован, всегда None. Фронт показывает счётчик
    # только когда != None — на старте просто скрыт.
    remaining_free: int | None = None
    created_at: datetime
