"""Тесты Celery-задач (без реальных HTTP-вызовов).

Целимся в логику purge_review_raw_text (cron) и базовую регистрацию задач
в Celery. Полную интеграцию parse_map_search end-to-end тестируем
в ШАГе 5 уже через API-эндпоинт.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from app.core.database import AsyncSessionLocal
from app.models.maps import Company, MapSearch, Review
from app.modules.maps import service
from app.modules.maps.schemas import CompanyRaw, ReviewRaw
from app.modules.maps.tasks import (
    _purge_review_raw_text_async,
    parse_company_reviews,
    parse_map_search,
    purge_review_raw_text,
)


def _unique_id(prefix: str) -> str:
    return f"task-{prefix}-{uuid.uuid4().hex[:12]}"


def test_celery_tasks_registered_with_correct_queues():
    assert parse_map_search.name == "parse_map_search"
    assert parse_map_search.queue == "maps"
    assert parse_company_reviews.name == "parse_company_reviews"
    assert parse_company_reviews.queue == "maps_reviews"
    assert purge_review_raw_text.name == "purge_review_raw_text"
    assert purge_review_raw_text.queue == "maintenance"


@pytest.mark.asyncio
async def test_purge_review_raw_text_targets_only_old_rows():
    async with AsyncSessionLocal() as db:
        # Создаём компанию + 1 свежий и 1 старый отзыв
        from app.models.user import User
        from app.core.security import hash_password
        user = User(
            email=f"purge_{uuid.uuid4().hex[:8]}@t.example.com",
            hashed_password=hash_password("x"), is_active=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        search = await service.create_map_search(db, user_id=user.id, niche="x", city="y", sources=["2gis"])
        co = (await service.save_companies_batch(
            db, [CompanyRaw(source="2gis", external_id=_unique_id("co"), name="X")], search.id,
        ))[0]

        # 2 свежих
        fresh_marker = f"fresh-{uuid.uuid4()}"
        old_marker = f"old-{uuid.uuid4()}"
        await service.save_reviews_batch(db, co.id, [
            ReviewRaw(source="2gis", rating=5, raw_text=fresh_marker),
            ReviewRaw(source="2gis", rating=5, raw_text=old_marker),
        ])

        # одному отзыву искусственно состарим created_at до 35 дней
        await db.execute(
            text("UPDATE reviews SET created_at = NOW() - INTERVAL '35 days' WHERE company_id = :cid AND raw_text = :marker"),
            {"cid": co.id, "marker": old_marker},
        )
        await db.commit()

        purged = await _purge_review_raw_text_async()
        assert purged >= 1  # минимум наш один

        # перечитываем — старый затёрт, новый цел
        from sqlalchemy import select
        rows = list((await db.execute(
            select(Review.raw_text, Review.raw_text_purged_at).where(Review.company_id == co.id)
        )).all())
        by_text = {r[0]: r[1] for r in rows}
        # свежий по-прежнему имеет текст
        assert fresh_marker in by_text and by_text[fresh_marker] is None  # purged_at NULL = не трогали
        # старый — None (затёрт) и purged_at установлен
        purged_rows = [r for r in rows if r[1] is not None and r[0] is None]
        assert len(purged_rows) >= 1
