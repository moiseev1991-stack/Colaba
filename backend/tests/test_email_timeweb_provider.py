# -*- coding: utf-8 -*-
"""Тесты для timeweb-провайдера и дневного лимита (day-cap).

Покрываем:
1. Реестр провайдеров содержит 'timeweb' и его поля (id, fields, default).
2. Day-cap: _enforce_daily_limit поднимает EmailServiceError при достижении
   лимита и пропускает, когда отправок меньше лимита.
3. Шаблон cold-email (templates_seed) содержит subject + body непустые.

Не дёргаем реальный SMTP/api_call_log — мокаем через monkeypatch.
"""

from __future__ import annotations

import pytest

from app.modules.email.providers_registry import (
    EMAIL_PROVIDER_REGISTRY,
    get_all_provider_ids,
    get_registry_entry,
)
from app.modules.email.service import EmailService, EmailServiceError
from app.modules.outreach.templates_seed import COLD_EMAIL_AUTOMATION_TEMPLATE


def test_timeweb_in_registry():
    """timeweb зарегистрирован как провайдер."""
    assert "timeweb" in get_all_provider_ids()
    entry = get_registry_entry("timeweb")
    assert entry is not None
    assert entry["id"] == "timeweb"
    assert "spinlid-team.ru" in entry["description"]


def test_timeweb_registry_fields():
    """У timeweb есть обязательные SMTP-поля и нет лишних (api_key)."""
    entry = get_registry_entry("timeweb")
    keys = {f["key"] for f in entry["fields"]}
    # Минимальный набор для классического SMTP.
    assert {"smtp_host", "smtp_port", "smtp_user", "smtp_password"} <= keys
    # timeweb — НЕ API-key провайдер, как hyvor.
    assert "api_key" not in keys
    # from_email по умолчанию = dmitry@spinlid-team.ru.
    from_field = next(f for f in entry["fields"] if f["key"] == "from_email")
    assert from_field["default"] == "dmitry@spinlid-team.ru"


def test_registry_priority_order():
    """Реестр упорядочен по приоритету: postbox(0) < ses(1) < hyvor(2) < timeweb(3)."""
    ids = get_all_provider_ids()
    assert ids == ["postbox", "ses", "hyvor", "timeweb"]
    entries = {e["id"]: e for e in EMAIL_PROVIDER_REGISTRY}
    assert entries["postbox"]["default_priority"] == 0
    assert entries["timeweb"]["default_priority"] == 3


@pytest.mark.asyncio
async def test_enforce_daily_limit_blocks_when_reached(monkeypatch):
    """При sent_today >= limit поднимает EmailServiceError с маркером daily_limit."""
    svc = EmailService.__new__(EmailService)

    # Мокаем db.execute → scalar возвращает 12 (лимит исчерпан).
    class _Scalar:
        def __init__(self, val):
            self._val = val

        def scalar(self):
            return self._val

    class _FakeDB:
        def __init__(self, count):
            self._count = count

        async def execute(self, *a, **kw):
            return _Scalar(self._count)

    fake_db = _FakeDB(12)
    with pytest.raises(EmailServiceError) as exc:
        await svc._enforce_daily_limit(fake_db, "timeweb", limit=12)
    assert "daily_limit" in str(exc.value)
    assert "timeweb" in str(exc.value)


@pytest.mark.asyncio
async def test_enforce_daily_limit_allows_below_limit():
    """При sent_today < limit — без ошибки."""
    svc = EmailService.__new__(EmailService)

    class _Scalar:
        def __init__(self, val):
            self._val = val

        def scalar(self):
            return self._val

    class _FakeDB:
        def __init__(self, count):
            self._count = count

        async def execute(self, *a, **kw):
            return _Scalar(self._count)

    # 5 отправлено при лимите 12 — должно пропустить.
    fake_db = _FakeDB(5)
    # Если не падает — тест пройден.
    await svc._enforce_daily_limit(fake_db, "timeweb", limit=12)


@pytest.mark.asyncio
async def test_enforce_daily_limit_zero_count():
    """При нуле отправок — без ошибки (новый день)."""

    class _Scalar:
        def scalar(self):
            return 0

    class _FakeDB:
        async def execute(self, *a, **kw):
            return _Scalar()

    svc = EmailService.__new__(EmailService)
    await svc._enforce_daily_limit(_FakeDB(), "timeweb", limit=12)


def test_cold_email_template_not_empty():
    """Шаблон cold-email содержит непустые subject + body."""
    assert COLD_EMAIL_AUTOMATION_TEMPLATE["subject"].strip()
    assert COLD_EMAIL_AUTOMATION_TEMPLATE["body"].strip()
    # Боль из легенды упоминается в теле.
    assert "не дозвон" in COLD_EMAIL_AUTOMATION_TEMPLATE["body"].lower()
    # Подпись с контактом.
    assert "spinlid" in COLD_EMAIL_AUTOMATION_TEMPLATE["body"].lower()
