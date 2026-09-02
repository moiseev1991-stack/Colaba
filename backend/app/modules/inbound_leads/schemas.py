"""Pydantic-схемы приёмника заявок."""

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class InboundLeadSubmit(BaseModel):
    """Тело POST /api/v1/inbound-leads. Шлют и бот, и форма лендинга."""

    source: Literal["tg_bot", "landing_form"]
    source_tag: str = Field(default="", max_length=120)  # start payload / utm_source

    tg_user_id: Optional[int] = None
    tg_username: Optional[str] = Field(default=None, max_length=64)

    name: str = Field(default="", max_length=255)
    company_text: str = ""   # название или ссылка на 2ГИС/Я.Карты
    contact_text: str = ""   # телефон / username / «пишите сюда»

    # Лента входящих сообщений. Принимаем и строки, и объекты {text, at}.
    raw_messages: list[Any] = Field(default_factory=list)

    created_at: Optional[datetime] = None  # если не задан — ставит сервер


class InboundLeadPublicSubmit(BaseModel):
    """Тело POST /api/v1/inbound-leads/public — публичная форма лендинга.

    Без секрета (статика на Timeweb), защита = honeypot + rate-limit + consent.
    source фиксируется сервером = landing_form; tg-поля не принимаем.
    """

    company_text: str = Field(default="", max_length=2000)  # название/ссылка 2ГИС/Я.Карт
    contact_text: str = Field(default="", max_length=255)    # телефон / Telegram
    name: str = Field(default="", max_length=255)
    source_tag: str = Field(default="", max_length=120)      # utm_source / ?start=landing

    consent: bool = False   # чекбокс согласия на обработку ПДн (обязателен)
    hp: str = Field(default="", max_length=255)  # honeypot: должно быть пусто


class InboundLeadSubmitResponse(BaseModel):
    id: int
    status: str
    matched_company_id: Optional[int] = None
    is_new: bool  # False → дописали существующую заявку того же tg_user_id


class InboundLeadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source: str
    source_tag: str
    tg_user_id: Optional[int]
    tg_username: Optional[str]
    name: str
    company_text: str
    contact_text: str
    raw_messages: list[Any]
    status: str
    matched_company_id: Optional[int]
    created_at: datetime
    updated_at: datetime


class InboundLeadListResponse(BaseModel):
    items: list[InboundLeadOut]
    total: int


class InboundLeadStatusUpdate(BaseModel):
    status: Literal["new", "in_progress", "replied", "closed"]
