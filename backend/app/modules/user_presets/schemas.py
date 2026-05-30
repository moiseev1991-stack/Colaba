"""Pydantic-схемы для модуля пользовательских пресетов фильтров."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


# Сейчас единственный модуль — maps. Поле module зарезервировано на будущее
# (расширение на searches, tenders и т.д.) — добавляйте сюда новые литералы.
PresetModule = Literal["maps"]


class UserPresetCreate(BaseModel):
    """Тело POST /user-presets. filter — произвольный JSON-объект,
    интерпретируется фронтом и/или нужным модулем (для maps — MapSearchFilter)."""

    model_config = ConfigDict(extra="ignore")

    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=1000)
    module: PresetModule = "maps"
    filter: dict[str, Any]


class UserPresetUpdate(BaseModel):
    """Тело PATCH /user-presets/{id}. Все поля опциональны, обновляется
    то, что передано (None в name не сбрасывает name)."""

    model_config = ConfigDict(extra="ignore")

    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=1000)
    filter: dict[str, Any] | None = None


class UserPresetOut(BaseModel):
    """Ответ API."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    module: str
    name: str
    description: str | None = None
    filter: dict[str, Any]
    created_at: datetime
    updated_at: datetime
