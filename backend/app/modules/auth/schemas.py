"""
Auth module schemas.
"""

from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


class UserRegister(BaseModel):
    """Schema for user registration."""

    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=8, description="User password (min 8 characters)")


class UserLogin(BaseModel):
    """Schema for user login."""

    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., description="User password")


class TokenResponse(BaseModel):
    """Schema for token response."""

    access_token: str = Field(..., description="JWT access token")
    refresh_token: str = Field(..., description="JWT refresh token")
    token_type: str = Field(default="bearer", description="Token type")


class RefreshTokenRequest(BaseModel):
    """Schema for refresh token request."""

    refresh_token: str = Field(..., description="JWT refresh token")


class UserResponse(BaseModel):
    """Schema for user response."""

    id: int
    email: str
    is_active: bool
    is_superuser: bool
    created_at: datetime
    reply_to_email: str | None = None

    class Config:
        from_attributes = True


class UserUpdateMe(BaseModel):
    """Schema for PATCH /auth/me — обновление профиля текущим юзером.

    Пока управляем только reply_to_email — личным адресом для ответов
    в outreach-рассылках. EmailStr даёт валидацию формата (в отличие от
    старого провайдер-конфига, где from_email был plain str).
    """

    reply_to_email: EmailStr | None = Field(
        default=None,
        description="Email для ответов в рассылке (Reply-To). Лиды будут отвечать на этот адрес. null = сбросить.",
    )
