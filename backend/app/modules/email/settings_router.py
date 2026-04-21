"""API for global email configuration (Hyvor Relay + SMTP + IMAP)."""

from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings as app_settings
from app.core.database import get_db
from app.core.dependencies import get_current_user_id, require_superuser
from app.models.email_config import EmailConfig
from app.models.user import User
from app.modules.email.service import EmailServiceError, email_service

router = APIRouter(prefix="/email", tags=["Email Settings"])

MASK = "***"


class EmailSettingsResponse(BaseModel):
    provider_type: str = "smtp"
    hyvor_api_url: Optional[str] = None
    hyvor_api_key: str = ""
    hyvor_webhook_secret: str = ""
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = 465
    smtp_user: Optional[str] = None
    smtp_password: str = ""
    smtp_use_ssl: bool = True
    smtp_from_email: Optional[str] = None
    smtp_from_name: Optional[str] = None
    reply_to_email: Optional[str] = None
    imap_host: Optional[str] = None
    imap_port: Optional[int] = 993
    imap_user: Optional[str] = None
    imap_password: str = ""
    imap_use_ssl: bool = True
    imap_mailbox: str = "INBOX"
    reply_prefix: str = "reply-"
    is_configured: bool = False
    last_test_at: Optional[datetime] = None
    last_test_result: Optional[str] = None


class EmailSettingsUpdate(BaseModel):
    provider_type: Optional[str] = None
    hyvor_api_url: Optional[str] = None
    hyvor_api_key: Optional[str] = None
    hyvor_webhook_secret: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_use_ssl: Optional[bool] = None
    smtp_from_email: Optional[str] = None
    smtp_from_name: Optional[str] = None
    reply_to_email: Optional[str] = None
    imap_host: Optional[str] = None
    imap_port: Optional[int] = None
    imap_user: Optional[str] = None
    imap_password: Optional[str] = None
    imap_use_ssl: Optional[bool] = None
    imap_mailbox: Optional[str] = None
    reply_prefix: Optional[str] = None
    imap_mailbox: Optional[str] = None


class TestSmtpBody(BaseModel):
    test_email: str = Field(..., description="Recipient for test message")


class TestResult(BaseModel):
    success: bool
    message: str


class EmailStatusResponse(BaseModel):
    configured: bool
    provider: str


def _mask_secret(value: Optional[str]) -> str:
    if value:
        return MASK
    return ""


def row_to_response(row: EmailConfig) -> EmailSettingsResponse:
    return EmailSettingsResponse(
        provider_type=row.provider_type or "smtp",
        hyvor_api_url=row.hyvor_api_url,
        hyvor_api_key=_mask_secret(row.hyvor_api_key),
        hyvor_webhook_secret=_mask_secret(row.hyvor_webhook_secret),
        smtp_host=row.smtp_host,
        smtp_port=row.smtp_port,
        smtp_user=row.smtp_user,
        smtp_password=_mask_secret(row.smtp_password),
        smtp_use_ssl=bool(row.smtp_use_ssl),
        smtp_from_email=row.smtp_from_email,
        smtp_from_name=row.smtp_from_name,
        reply_to_email=row.reply_to_email,
        imap_host=row.imap_host,
        imap_port=row.imap_port,
        imap_user=row.imap_user,
        imap_password=_mask_secret(row.imap_password),
        imap_use_ssl=bool(row.imap_use_ssl),
        imap_mailbox=row.imap_mailbox or "INBOX",
        reply_prefix=row.reply_prefix or "reply-",
        is_configured=bool(row.is_configured),
        last_test_at=row.last_test_at,
        last_test_result=row.last_test_result,
    )


async def _get_or_create_row(db: AsyncSession) -> EmailConfig:
    result = await db.execute(select(EmailConfig).where(EmailConfig.id == 1))
    row = result.scalar_one_or_none()
    if row:
        return row
    row = EmailConfig(id=1)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


def _apply_secret_update(current: Optional[str], new_val: Optional[str]) -> Optional[str]:
    if new_val is None:
        return current
    if new_val in ("", MASK):
        return current
    return new_val


@router.get("/settings", response_model=EmailSettingsResponse)
async def get_email_settings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superuser),
):
    row = await _get_or_create_row(db)
    return row_to_response(row)


@router.put("/settings", response_model=EmailSettingsResponse)
async def update_email_settings(
    body: EmailSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superuser),
):
    row = await _get_or_create_row(db)
    data = body.model_dump(exclude_unset=True)
    for key, val in data.items():
        if key in ("smtp_password", "imap_password", "hyvor_api_key", "hyvor_webhook_secret"):
            setattr(row, key, _apply_secret_update(getattr(row, key), val))
        elif hasattr(row, key):
            setattr(row, key, val)
    row.updated_at = datetime.utcnow()
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row_to_response(row)


@router.post("/settings/test-smtp", response_model=TestResult)
async def test_smtp(
    body: TestSmtpBody,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superuser),
):
    row = await _get_or_create_row(db)
    try:
        await email_service.send_email(
            to_email=body.test_email,
            subject="Colaba: тест SMTP",
            body="Это тестовое письмо. SMTP настроен корректно.",
            from_email=row.smtp_from_email or row.smtp_user,
            from_name=row.smtp_from_name or "Colaba",
            db=db,
            force_provider="smtp",
        )
        row.last_test_at = datetime.utcnow()
        row.last_test_result = "success"
        row.is_configured = True
        db.add(row)
        await db.commit()
        return TestResult(success=True, message="Тестовое письмо отправлено")
    except EmailServiceError as e:
        row.last_test_at = datetime.utcnow()
        row.last_test_result = "error"
        db.add(row)
        await db.commit()
        return TestResult(success=False, message=str(e))


@router.post("/settings/test-hyvor", response_model=TestResult)
async def test_hyvor(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superuser),
):
    row = await _get_or_create_row(db)
    api_url = (row.hyvor_api_url or app_settings.HYVOR_RELAY_API_URL or "").rstrip("/")
    api_key = row.hyvor_api_key or app_settings.HYVOR_RELAY_API_KEY
    if not api_url or not api_key:
        return TestResult(success=False, message="Укажите Hyvor API URL и API Key")
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                f"{api_url}/",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if r.status_code >= 500:
                return TestResult(
                    success=False,
                    message=f"HTTP {r.status_code}: {r.text[:200]}",
                )
        row.last_test_at = datetime.utcnow()
        row.last_test_result = "success"
        row.is_configured = True
        db.add(row)
        await db.commit()
        return TestResult(success=True, message="Подключение к Hyvor Relay API успешно")
    except Exception as e:
        row.last_test_at = datetime.utcnow()
        row.last_test_result = "error"
        db.add(row)
        await db.commit()
        return TestResult(success=False, message=str(e))


@router.get("/settings/status", response_model=EmailStatusResponse)
async def email_settings_status(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    _ = user_id
    result = await db.execute(select(EmailConfig).where(EmailConfig.id == 1))
    row = result.scalar_one_or_none()
    if not row or not row.is_configured:
        env_ok = bool(app_settings.HYVOR_RELAY_ENABLED and app_settings.HYVOR_RELAY_API_KEY)
        return EmailStatusResponse(configured=env_ok, provider="hyvor" if env_ok else "none")
    return EmailStatusResponse(
        configured=True,
        provider=row.provider_type or "smtp",
    )
