"""Outreach sending schemas."""

from typing import Optional, Literal
from pydantic import BaseModel, EmailStr, Field


class OutreachEmailRequest(BaseModel):
    to_email: str = Field(..., description="Recipient email address")
    subject: str = Field(..., min_length=1, max_length=500)
    body: str = Field(..., min_length=1)
    from_name: Optional[str] = Field(default=None, description="Sender display name")


class OutreachTelegramRequest(BaseModel):
    chat_id: str = Field(..., description="Telegram chat_id or @username")
    message: str = Field(..., min_length=1, max_length=4096)


class BulkOutreachRequest(BaseModel):
    search_result_ids: list[int] = Field(..., min_length=1, description="SearchResult IDs to send outreach to")
    channel: Literal["email", "telegram"] = Field(default="email")
    telegram_chat_id: Optional[str] = Field(default=None, description="Required for telegram channel")
    from_name: Optional[str] = Field(default=None)


class OutreachResult(BaseModel):
    search_result_id: int
    status: Literal["sent", "skipped", "error"]
    reason: Optional[str] = None


class BulkOutreachResponse(BaseModel):
    sent: int
    skipped: int
    errors: int
    results: list[OutreachResult]


class SmtpConfig(BaseModel):
    """Frontend-editable SMTP settings (without password exposure)."""
    host: str
    port: int
    user: str
    password: Optional[str] = Field(default=None, description="Leave empty to keep existing password")
    use_ssl: bool = True


class SmtpConfigResponse(BaseModel):
    host: str
    port: int
    user: str
    use_ssl: bool
    configured: bool
