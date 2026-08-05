# -*- coding: utf-8 -*-
"""Тесты сериализации datetime как UTC-aware в email-кампаниях.

Регрессия баги: бэкенд отдавал naive UTC datetime без 'Z'/смещения → фронт
парсил как локальное время браузера → пользователь видел сдвиг -3 часа.
После фикса — datetime помечается UTC-aware, Pydantic добавляет '+00:00'.
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.modules.email.campaigns_router import _serialize_utc


def test_serialize_utc_marks_naive_as_utc():
    """Naive datetime (из SQLAlchemy без tz) → UTC-aware."""
    naive = datetime(2026, 8, 5, 21, 32, 23)  # то, что вернёт БД
    aware = _serialize_utc(naive)
    assert aware is not None
    assert aware.tzinfo is not None
    # Pydantic сериализует aware → ISO с '+00:00'
    iso = aware.isoformat()
    assert iso == "2026-08-05T21:32:23+00:00"


def test_serialize_utc_keeps_already_aware():
    """Aware datetime не модифицируется."""
    aware = datetime(2026, 8, 5, 21, 32, 23, tzinfo=timezone.utc)
    out = _serialize_utc(aware)
    assert out == aware
    assert out.tzinfo is not None


def test_serialize_utc_none_passes_through():
    """None (для nullable полей) → None."""
    assert _serialize_utc(None) is None


def test_pydantic_serializes_with_offset():
    """End-to-end: Pydantic добавляет '+00:00' к ISO-строке.

    Это и есть фикс баги — фронтовый ``new Date(iso)`` теперь видит смещение
    и конвертирует в локаль браузера (Europe/Moscow).
    """
    from app.modules.email.campaigns_router import CampaignResponse

    resp = CampaignResponse(
        id=1,
        name="Test",
        subject="Subj",
        status="completed",
        total_recipients=5,
        sent_count=5,
        delivered_count=0,
        opened_count=0,
        clicked_count=0,
        bounced_count=0,
        spam_count=0,
        failed_count=0,
        from_email=None,
        from_name=None,
        created_at=datetime(2026, 8, 5, 21, 32, 23),  # naive, как из БД
        started_at=None,
        completed_at=None,
    )
    dumped = resp.model_dump(mode="json")
    assert dumped["created_at"] == "2026-08-05T21:32:23+00:00"
    # nullable поле проходит как None, не падая на сериализаторе.
    assert dumped["started_at"] is None
