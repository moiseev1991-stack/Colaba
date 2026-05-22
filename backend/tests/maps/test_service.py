"""Интеграционные тесты service.py против реальной БД.

Используется AsyncSessionLocal как и в существующих тестах
(см. tests/test_html_providers.py). Каждая компания/отзыв создаётся
с уникальным external_id через uuid, чтобы тесты не мешали друг другу
и leftover-данным от прошлых прогонов.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.maps import Company, MapSearch, MapSearchResult, Review
from app.modules.maps import service
from app.modules.maps.schemas import CompanyRaw, MapSearchFilter, ReviewRaw


def _unique_id(prefix: str) -> str:
    return f"test-{prefix}-{uuid.uuid4().hex[:12]}"


async def _make_user_id(db) -> int:
    """Создаёт юзера для FK на map_searches.user_id. Возвращает id."""
    from app.models.user import User
    from app.core.security import hash_password

    user = User(
        email=f"map_test_{uuid.uuid4().hex[:8]}@test.example.com",
        hashed_password=hash_password("test"),
        is_active=True,
        is_superuser=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user.id


# ---------------------------------------------------------------------------
# check_cache + upsert_cache_entry
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_check_cache_returns_false_initially_and_true_after_upsert():
    niche = _unique_id("niche")
    city = _unique_id("city")
    async with AsyncSessionLocal() as db:
        assert (await service.check_cache(db, niche, city, "2gis")) is False
        await service.upsert_cache_entry(db, niche, city, "2gis", companies_count=10, reviews_count=0, ttl_days=14)
        assert (await service.check_cache(db, niche, city, "2gis")) is True


@pytest.mark.asyncio
async def test_check_cache_respects_expiry():
    niche = _unique_id("expired")
    city = _unique_id("city")
    async with AsyncSessionLocal() as db:
        # вручную ставим уже истекший expires_at
        from app.models.maps import MapSearchCache
        entry = MapSearchCache(
            niche=niche, city=city, source="2gis",
            companies_count=0, reviews_count=0,
            parsed_at=datetime.now(timezone.utc) - timedelta(days=20),
            expires_at=datetime.now(timezone.utc) - timedelta(days=1),
        )
        db.add(entry)
        await db.commit()
        assert (await service.check_cache(db, niche, city, "2gis")) is False


# ---------------------------------------------------------------------------
# save_companies_batch
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_save_companies_batch_upsert_and_link_to_search():
    async with AsyncSessionLocal() as db:
        user_id = await _make_user_id(db)
        search = await service.create_map_search(
            db, user_id=user_id, niche="dent", city="Москва", sources=["2gis"],
        )
        ext = _unique_id("co")
        raw = CompanyRaw(
            source="2gis", external_id=ext, name="Test Co",
            niche="dent", city="Москва", rating=4.2, reviews_count=10,
        )

        saved = await service.save_companies_batch(db, [raw], search.id)
        assert len(saved) == 1
        co_id = saved[0].id

        # повторный вызов с тем же external_id → upsert, не дубль
        raw2 = raw.model_copy(update={"rating": 4.5, "reviews_count": 20})
        saved2 = await service.save_companies_batch(db, [raw2], search.id, start_position=1)
        assert len(saved2) == 1
        assert saved2[0].id == co_id  # тот же
        assert float(saved2[0].rating) == pytest.approx(4.5)
        assert saved2[0].reviews_count == 20

        # связь в map_search_results существует
        link = (await db.execute(
            select(MapSearchResult).where(
                MapSearchResult.map_search_id == search.id,
                MapSearchResult.company_id == co_id,
            )
        )).scalar_one()
        assert link.position == 1  # из второго save


# ---------------------------------------------------------------------------
# save_reviews_batch + dedup
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_save_reviews_batch_dedup_by_text_hash():
    async with AsyncSessionLocal() as db:
        user_id = await _make_user_id(db)
        search = await service.create_map_search(db, user_id=user_id, niche="x", city="y", sources=["2gis"])
        raw = CompanyRaw(source="2gis", external_id=_unique_id("co"), name="X")
        co = (await service.save_companies_batch(db, [raw], search.id))[0]

        r1 = ReviewRaw(source="2gis", external_id="r1", rating=5, raw_text="Отличный сервис")
        # тот же текст, отличия в кейсе/пробелах/пунктуации → должен дедупнуться
        r2 = ReviewRaw(source="2gis", external_id="r2", rating=4, raw_text="  ОТЛИЧНЫЙ, сервис!  ")
        r3 = ReviewRaw(source="2gis", external_id="r3", rating=2, raw_text="Другой отзыв")

        inserted = await service.save_reviews_batch(db, co.id, [r1, r2, r3])
        assert inserted == 2  # r2 дублирует r1 по нормализованному text_hash

        # повторная вставка той же партии → 0 новых
        inserted2 = await service.save_reviews_batch(db, co.id, [r1, r3])
        assert inserted2 == 0


@pytest.mark.asyncio
async def test_save_reviews_batch_derived_sentiment():
    async with AsyncSessionLocal() as db:
        user_id = await _make_user_id(db)
        search = await service.create_map_search(db, user_id=user_id, niche="x", city="y", sources=["2gis"])
        co = (await service.save_companies_batch(
            db, [CompanyRaw(source="2gis", external_id=_unique_id("co"), name="X")], search.id,
        ))[0]

        rs = [
            ReviewRaw(source="2gis", external_id="a", rating=5, raw_text=f"unique-positive-{uuid.uuid4()}"),
            ReviewRaw(source="2gis", external_id="b", rating=1, raw_text=f"unique-negative-{uuid.uuid4()}"),
            ReviewRaw(source="2gis", external_id="c", rating=3, raw_text=f"unique-neutral-{uuid.uuid4()}"),
        ]
        assert await service.save_reviews_batch(db, co.id, rs) == 3

        reviews = list((await db.execute(
            select(Review).where(Review.company_id == co.id)
        )).scalars().all())
        sentiments = sorted([r.sentiment for r in reviews])
        assert sentiments == ["negative", "neutral", "positive"]


# ---------------------------------------------------------------------------
# update_company_aggregates
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_company_aggregates_counts_by_sentiment_and_owner_reply():
    async with AsyncSessionLocal() as db:
        user_id = await _make_user_id(db)
        search = await service.create_map_search(db, user_id=user_id, niche="x", city="y", sources=["2gis"])
        co = (await service.save_companies_batch(
            db, [CompanyRaw(source="2gis", external_id=_unique_id("co"), name="X")], search.id,
        ))[0]
        rs = [
            ReviewRaw(source="2gis", rating=5, raw_text=f"p1-{uuid.uuid4()}"),
            ReviewRaw(source="2gis", rating=4, raw_text=f"p2-{uuid.uuid4()}"),
            ReviewRaw(source="2gis", rating=1, raw_text=f"n1-{uuid.uuid4()}"),
            ReviewRaw(source="2gis", rating=3, raw_text=f"u1-{uuid.uuid4()}"),
            ReviewRaw(source="2gis", rating=4, raw_text=f"p3-{uuid.uuid4()}", has_owner_reply=True),
        ]
        await service.save_reviews_batch(db, co.id, rs)
        await service.update_company_aggregates(db, co.id)

        await db.refresh(co)
        assert co.reviews_count == 5
        assert co.reviews_positive_count == 3
        assert co.reviews_negative_count == 1
        assert co.reviews_neutral_count == 1
        assert co.has_owner_replies is True
        assert co.owner_replies_count == 1


# ---------------------------------------------------------------------------
# get_search_results + apply_filters
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_search_results_with_filters_and_sort():
    async with AsyncSessionLocal() as db:
        user_id = await _make_user_id(db)
        search = await service.create_map_search(db, user_id=user_id, niche="x", city="y", sources=["2gis"])

        # 3 компании с разными рейтингами
        raws = [
            CompanyRaw(source="2gis", external_id=_unique_id("a"), name="A", rating=3.0, reviews_count=5),
            CompanyRaw(source="2gis", external_id=_unique_id("b"), name="B", rating=4.5, reviews_count=20),
            CompanyRaw(source="2gis", external_id=_unique_id("c"), name="C", rating=5.0, reviews_count=50),
        ]
        await service.save_companies_batch(db, raws, search.id)

        # min_rating=4, sort by reviews_desc → B(20), C(50) — но порядок desc: C, B
        items, total = await service.get_search_results(
            db, search.id, filters=MapSearchFilter(min_rating=4.0, sort_by="reviews_desc"),
        )
        names = [c.name for c in items]
        assert total == 2
        assert names == ["C", "B"]


# ---------------------------------------------------------------------------
# create_map_search + cache hit
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_map_search_uses_cache_when_all_sources_cached():
    niche = _unique_id("cn")
    city = _unique_id("cc")
    async with AsyncSessionLocal() as db:
        await service.upsert_cache_entry(db, niche, city, "2gis", companies_count=5, reviews_count=0)
        await service.upsert_cache_entry(db, niche, city, "yandex_maps", companies_count=3, reviews_count=0)

        user_id = await _make_user_id(db)
        search = await service.create_map_search(
            db, user_id=user_id, niche=niche, city=city, sources=["2gis", "yandex_maps"],
        )
        assert search.status == "from_cache"


@pytest.mark.asyncio
async def test_create_map_search_pending_when_no_cache():
    async with AsyncSessionLocal() as db:
        user_id = await _make_user_id(db)
        search = await service.create_map_search(
            db, user_id=user_id,
            niche=_unique_id("n"), city=_unique_id("c"), sources=["2gis"],
        )
        assert search.status == "pending"
