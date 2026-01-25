"""Pydantic schemas for providers API."""

from typing import Any

from pydantic import BaseModel, Field


class ProviderConfigUpdate(BaseModel):
    """Body for PUT /providers/{id}: flat config by settings_schema."""

    config: dict[str, Any] = Field(default_factory=dict, description="Config: use_proxy, proxy_url, api_key, ...")


class ProviderTestBody(BaseModel):
    """Body for POST /providers/{id}/test. config — переопределения на время проверки (если не пусто)."""

    query: str = Field(default="кофе москва", description="Test search query")
    config: dict[str, Any] | None = Field(default=None, description="Подставить эти значения поверх сохранённых (пустые/*** не перезаписывают)")


class ProviderTestResponse(BaseModel):
    """Response for POST /providers/{id}/test."""

    ok: bool
    result_count: int | None = None
    error: str | None = None
