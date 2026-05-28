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


async def _seed_completed_search_with_companies(db, niche: str, city: str, source: str, n: int = 3) -> int:
    """Создаёт «успешный» завершённый MapSearch с n компаниями.
    Используется как base для проверки копирования при cache hit."""
    user_id = await _make_user_id(db)
    prev = await service.create_map_search(
        db, user_id=user_id, niche=niche, city=city, sources=[source],
    )
    raws = [
        CompanyRaw(
            source=source, external_id=_unique_id("seed"),
            name=f"Seed {i}", niche=niche, city=city,
            rating=4.0 + i * 0.1, reviews_count=10 + i,
        )
        for i in range(n)
    ]
    await service.save_companies_batch(db, raws, prev.id)
    # вручную помечаем как completed (в проде это делает Celery)
    prev.status = "completed"
    prev.companies_found = n
    prev.finished_at = datetime.now(timezone.utc)
    await db.commit()
    return prev.id


@pytest.mark.asyncio
async def test_create_map_search_from_cache_copies_results_from_previous_search():
    """При cache hit на все sources новый поиск получает status='from_cache'
    и наследует map_search_results от прошлого успешного поиска."""
    niche = _unique_id("cn")
    city = _unique_id("cc")
    async with AsyncSessionLocal() as db:
        prev_id = await _seed_completed_search_with_companies(db, niche, city, "2gis", n=3)
        await service.upsert_cache_entry(db, niche, city, "2gis", companies_count=3, reviews_count=0)

        user_id = await _make_user_id(db)
        search = await service.create_map_search(
            db, user_id=user_id, niche=niche, city=city, sources=["2gis"],
        )
        assert search.status == "from_cache"
        assert search.companies_found == 3
        assert search.finished_at is not None

        items, total = await service.get_search_results(db, search.id)
        assert total == 3
        assert len(items) == 3
        assert all(c.source == "2gis" for c in items)
        assert search.id != prev_id


@pytest.mark.asyncio
async def test_create_map_search_drops_stale_cache_when_no_results_to_copy():
    """Кэш есть, но прошлого успешного поиска нет (или он пустой) →
    запись кэша считается битой, удаляется, новый поиск идёт в pending."""
    niche = _unique_id("stale")
    city = _unique_id("city")
    async with AsyncSessionLocal() as db:
        # кэш есть, но реальных данных нет
        await service.upsert_cache_entry(db, niche, city, "2gis", companies_count=5, reviews_count=0)
        assert (await service.check_cache(db, niche, city, "2gis")) is True

        user_id = await _make_user_id(db)
        search = await service.create_map_search(
            db, user_id=user_id, niche=niche, city=city, sources=["2gis"],
        )
        assert search.status == "pending"
        # битая запись должна быть удалена, чтобы Celery нормально перепарсил
        assert (await service.check_cache(db, niche, city, "2gis")) is False


@pytest.mark.asyncio
async def test_create_map_search_mixed_cache_falls_back_to_pending():
    """Один source из кэша берётся успешно, второй кэша не имеет →
    общий статус 'pending' (Celery допарсит недостающий source)."""
    niche = _unique_id("mix")
    city = _unique_id("city")
    async with AsyncSessionLocal() as db:
        await _seed_completed_search_with_companies(db, niche, city, "2gis", n=2)
        await service.upsert_cache_entry(db, niche, city, "2gis", companies_count=2, reviews_count=0)

        user_id = await _make_user_id(db)
        search = await service.create_map_search(
            db, user_id=user_id, niche=niche, city=city, sources=["2gis", "yandex_maps"],
        )
        assert search.status == "pending"
        # 2gis уже скопировано в новый поиск, чтобы UI не был пустым на старте
        items, total = await service.get_search_results(db, search.id)
        assert total == 2
        assert all(c.source == "2gis" for c in items)


@pytest.mark.asyncio
async def test_create_map_search_pending_when_no_cache():
    async with AsyncSessionLocal() as db:
        user_id = await _make_user_id(db)
        search = await service.create_map_search(
            db, user_id=user_id,
            niche=_unique_id("n"), city=_unique_id("c"), sources=["2gis"],
        )
        assert search.status == "pending"


@pytest.mark.asyncio
async def test_copy_results_filters_by_source_for_multi_source_previous_search():
    """Если в прошлом поиске были 2gis + yandex_maps, копируем только
    запрошенный source — UI с режимом «только 2gis» не должен получить
    чужие компании."""
    niche = _unique_id("multi")
    city = _unique_id("city")
    async with AsyncSessionLocal() as db:
        user_id = await _make_user_id(db)
        prev = await service.create_map_search(
            db, user_id=user_id, niche=niche, city=city, sources=["2gis", "yandex_maps"],
        )
        await service.save_companies_batch(db, [
            CompanyRaw(source="2gis", external_id=_unique_id("g"), name="G1", niche=niche, city=city),
            CompanyRaw(source="2gis", external_id=_unique_id("g"), name="G2", niche=niche, city=city),
            CompanyRaw(source="yandex_maps", external_id=_unique_id("y"), name="Y1", niche=niche, city=city),
        ], prev.id)
        prev.status = "completed"
        prev.finished_at = datetime.now(timezone.utc)
        await db.commit()

        new_search = MapSearch(
            user_id=user_id, niche=niche, city=city,
            sources="2gis", status="pending",
        )
        db.add(new_search)
        await db.commit()
        await db.refresh(new_search)

        copied = await service.copy_results_from_previous_search(
            db, niche=niche, city=city, source="2gis", new_search_id=new_search.id,
        )
        assert copied == 2  # только две 2gis-компании, yandex_maps не копируется


@pytest.mark.asyncio
async def test_list_search_companies_missing_reviews_returns_only_empty_ones():
    """list_search_companies_missing_reviews отдаёт только компании с
    reviews_count == 0; компания с отзывами не попадает в список."""
    niche = _unique_id("miss")
    city = _unique_id("city")
    async with AsyncSessionLocal() as db:
        user_id = await _make_user_id(db)
        search = await service.create_map_search(
            db, user_id=user_id, niche=niche, city=city, sources=["2gis"],
        )
        await service.save_companies_batch(db, [
            CompanyRaw(source="2gis", external_id=_unique_id("a"), name="A", niche=niche, city=city),
            CompanyRaw(source="2gis", external_id=_unique_id("b"), name="B", niche=niche, city=city),
            CompanyRaw(source="2gis", external_id=_unique_id("c"), name="C", niche=niche, city=city),
        ], search.id)

        # одной компании докинем отзыв и обновим агрегаты — она должна выпасть из missing
        companies = (await db.execute(
            select(Company)
            .join(MapSearchResult, MapSearchResult.company_id == Company.id)
            .where(MapSearchResult.map_search_id == search.id)
            .order_by(Company.name)
        )).scalars().all()
        a_id = companies[0].id
        await service.save_reviews_batch(db, a_id, [
            ReviewRaw(source="2gis", rating=5, raw_text=f"u-{uuid.uuid4()}"),
        ])
        await service.update_company_aggregates(db, a_id)

        missing = await service.list_search_companies_missing_reviews(db, search.id)
        ids = {c[0] for c in missing}
        # A с отзывом не должна быть в списке; B и C — должны
        assert a_id not in ids
        assert {companies[1].id, companies[2].id}.issubset(ids)
        # source отдаётся корректно
        assert all(src == "2gis" for _, src in missing)
