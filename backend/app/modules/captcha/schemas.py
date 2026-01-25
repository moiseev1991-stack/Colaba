"""Pydantic schemas for captcha config API."""

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class CaptchaConfigUpdate(BaseModel):
    ai_assistant_id: Optional[int] = Field(None, description="ID AI-ассистента с vision для картинок; null = не использовать")
    external_services: Optional[Dict[str, Any]] = Field(
        None,
        description='{"2captcha": {"enabled": bool, "api_key": str}, "anticaptcha": {"enabled": bool, "api_key": str}}',
    )
