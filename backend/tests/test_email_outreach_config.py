"""Unit tests for outreach email config summary (mocked DB)."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from app.modules.email.service import EmailService


@pytest.mark.asyncio
async def test_get_outreach_config_summary_smtp_configured():
    svc = EmailService()
    row = MagicMock()
    row.provider_type = "smtp"
    row.smtp_host = "smtp.example.com"
    row.smtp_port = 587
    row.smtp_user = "u"
    row.smtp_password = "p"
    row.smtp_use_ssl = False
    row.smtp_from_email = "from@example.com"

    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=row)
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)

    out = await svc.get_outreach_config_summary(db)

    assert out["provider_type"] == "smtp"
    assert out["configured"] is True
    assert out["host"] == "smtp.example.com"
    assert out["port"] == 587
    assert out["user"] == "u"
    assert out["use_ssl"] is False
    assert out["hyvor_api_url"] is None


@pytest.mark.asyncio
async def test_get_outreach_config_summary_hyvor():
    svc = EmailService()
    row = MagicMock()
    row.provider_type = "hyvor"
    row.hyvor_api_url = "http://relay:8000"
    row.hyvor_api_key = "secret-key"

    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=row)
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)

    out = await svc.get_outreach_config_summary(db)

    assert out["provider_type"] == "hyvor"
    assert out["configured"] is True
    assert out["hyvor_api_url"] == "http://relay:8000"
