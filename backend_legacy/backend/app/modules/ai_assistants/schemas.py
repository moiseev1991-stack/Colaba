"""Pydantic schemas for AI assistants API."""

from typing import Any, Dict

from pydantic import BaseModel, Field


class AiAssistantCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    provider_type: str = Field(..., min_length=1, max_length=64)
    model: str = Field(..., min_length=1, max_length=255)
    config: Dict[str, Any] = Field(default_factory=dict)
    supports_vision: bool = False
    is_default: bool = False


class AiAssistantUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    provider_type: str | None = Field(None, min_length=1, max_length=64)
    model: str | None = Field(None, min_length=1, max_length=255)
    config: Dict[str, Any] | None = None
    supports_vision: bool | None = None
    is_default: bool | None = None


class AiAssistantResponse(BaseModel):
    id: int
    name: str
    provider_type: str
    model: str
    config: Dict[str, Any]
    supports_vision: bool
    is_default: bool
    updated_at: str | None = None

    class Config:
        from_attributes = True
