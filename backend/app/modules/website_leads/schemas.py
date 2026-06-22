"""Pydantic-схемы для website_leads — публичный submit + админский CRUD."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


# Каналы связи, которые показываем юзеру на форме. Фронт обязан слать
# одно из этих значений — иначе 422.
Channel = Literal["email", "phone", "whatsapp", "telegram", "max"]
LeadStatus = Literal["new", "contacted", "qualified", "spam"]


class WebsiteLeadSubmit(BaseModel):
    """Входящая заявка с публичной формы.

    `_hp` — honeypot, скрытое поле в HTML. Боты заполняют все поля,
    люди — нет. Если непусто — service отклоняет тихо (200 + 'ok'),
    чтобы бот не узнал что нас не обмануть.
    """

    name: str = Field(default="", max_length=120)
    channel: Channel
    contact: str = Field(min_length=2, max_length=255)
    wish: str = Field(default="", max_length=2000)
    source_page: str = Field(default="", max_length=500)
    referrer: str = Field(default="", max_length=500)
    # Honeypot: должен оставаться пустым в нормальном submit.
    hp: Optional[str] = Field(default="", max_length=500, alias="_hp")
    # Server-issued token, выданный по POST /website-leads/token.
    # Бэк проверяет HMAC + возраст + one-shot. См. antispam.py.
    form_token: Optional[str] = Field(default="", max_length=200, alias="_form_token")
    # Сколько миллисекунд между рендером формы и submit'ом. Меньше 3000 = бот.
    fill_time_ms: Optional[int] = Field(default=0, ge=0, le=60 * 60 * 1000, alias="_fill_time_ms")

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("name", "contact", "wish")
    @classmethod
    def _strip(cls, v: str) -> str:
        return (v or "").strip()


class WebsiteLeadSubmitResponse(BaseModel):
    ok: bool = True
    # Не возвращаем id, чтобы боты не enumerate'или.
    message: str = "Заявка принята. Свяжемся в ближайшее время."


class WebsiteLeadOut(BaseModel):
    id: int
    name: str
    channel: str
    contact: str
    wish: str
    source_page: str
    referrer: str
    ip: str
    user_agent: str
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WebsiteLeadListResponse(BaseModel):
    items: list[WebsiteLeadOut]
    total: int


class WebsiteLeadStatusUpdate(BaseModel):
    status: LeadStatus
