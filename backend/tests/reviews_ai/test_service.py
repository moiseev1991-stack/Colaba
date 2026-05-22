"""Интеграционные тесты reviews_ai.service против реальной БД."""

from __future__ import annotations  # noqa: только в тестах

import uuid

import numpy as np
import pytest
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.maps import Company, Review
from app.models.pain_tag import CompanyPainScore, PainTag, ReviewPainTag
from app.modules.maps import service as maps_service
from app.modules.maps.schemas import CompanyRaw, ReviewRaw
from app.modules.reviews_ai import service as ai_service


def _u(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _vec(direction: list[float], dim: int = 1536) -> list[float]:
    """Возвращает 1536-мерный вектор, где первые len(direction) компонент = direction, остальные 0."""
    out = [0.0] * dim
    for i, v in enumerate(direction[:dim]):
        out[i] = v
    return out


async def _setup_user_and_company(db, niche="стоматология", city="Москва") -> Company:
    from app.core.security import hash_password
    from app.models.user import User
    user = User(
        email=f"ai_test_{uuid.uuid4().hex[:8]}@t.example.com",
        hashed_password=hash_password("x"), is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    search = await maps_service.create_map_search(
        db, user_id=user.id, niche=niche, city=city, sources=["2gis"],
    )
    co = (await maps_service.save_companies_batch(
        db,
        [CompanyRaw(source="2gis", external_id=_u("ext"), name=_u("Co"), niche=niche, city=city)],
        search.id,
    ))[0]
    return co


# ---------------------------------------------------------------------------
# match_reviews_to_pain_tags
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_match_above_threshold_assigns_tag_and_updates_score():
    async with AsyncSessionLocal() as db:
        co = await _setup_user_and_company(db)

        # Создаём отзыв с явным embedding
        rev_text = _u("review")
        await maps_service.save_reviews_batch(db, co.id, [
            ReviewRaw(source="2gis", rating=2, raw_text=rev_text),
        ])
        review = (await db.execute(
            select(Review).where(Review.company_id == co.id, Review.raw_text == rev_text)
        )).scalar_one()
        # вектор v1
        v = _vec([1.0, 0.0, 0.0])
        await db.execute(
            __import__("sqlalchemy").text("UPDATE reviews SET embedding = :v WHERE id = :id"),
            {"v": str(v), "id": review.id},
        )
        await db.commit()

        # PainTag с centroid почти таким же → сходство ~1
        tag = PainTag(
            niche=co.niche, city=co.city, label=_u("боль"),
            description="x", centroid=v,
            occurrences_count=0, status="active",
        )
        db.add(tag)
        await db.commit()
        await db.refresh(tag)

        assigned = await ai_service.match_reviews_to_pain_tags(db, [review.id], threshold=0.5)
        assert review.id in assigned and tag.id in assigned[review.id]

        # ReviewPainTag создан
        rpt = (await db.execute(
            select(ReviewPainTag).where(
                ReviewPainTag.review_id == review.id, ReviewPainTag.pain_tag_id == tag.id,
            )
        )).scalar_one()
        assert float(rpt.similarity) == pytest.approx(1.0, abs=1e-3)

        # CompanyPainScore инкрементнулся
        cps = (await db.execute(
            select(CompanyPainScore).where(
                CompanyPainScore.company_id == co.id, CompanyPainScore.pain_tag_id == tag.id,
            )
        )).scalar_one()
        assert cps.mention_count == 1


@pytest.mark.asyncio
async def test_match_below_threshold_does_not_save():
    async with AsyncSessionLocal() as db:
        co = await _setup_user_and_company(db, niche=_u("niche2"))

        rev_text = _u("rev")
        await maps_service.save_reviews_batch(db, co.id, [
            ReviewRaw(source="2gis", rating=4, raw_text=rev_text),
        ])
        review = (await db.execute(
            select(Review).where(Review.company_id == co.id, Review.raw_text == rev_text)
        )).scalar_one()
        # вектор отзыва [1,0,0]
        v_review = _vec([1.0, 0.0, 0.0])
        await db.execute(
            __import__("sqlalchemy").text("UPDATE reviews SET embedding = :v WHERE id = :id"),
            {"v": str(v_review), "id": review.id},
        )
        # PainTag с centroid [0,1,0] — cosine = 0
        tag = PainTag(
            niche=co.niche, city=co.city, label=_u("orth"),
            centroid=_vec([0.0, 1.0, 0.0]),
            status="active",
        )
        db.add(tag)
        await db.commit()
        await db.refresh(tag)

        assigned = await ai_service.match_reviews_to_pain_tags(db, [review.id], threshold=0.5)
        assert assigned == {}

        # никаких ReviewPainTag / CompanyPainScore не появилось
        rpt_rows = list((await db.execute(
            select(ReviewPainTag).where(ReviewPainTag.review_id == review.id)
        )).scalars().all())
        assert rpt_rows == []


# ---------------------------------------------------------------------------
# recluster
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_recluster_creates_tags_and_archives_unused(monkeypatch):
    """Готовим в БД отзывы с явными embedding в 3 группах + старый PainTag.
    После recluster — старый archived, появляются новые active.
    LLM-naming мокается так, чтобы возвращать стабильные имена."""
    niche = _u("niche3")
    city = _u("city3")

    # Мок LLM-naming: возвращает label по номеру кластера в порядке вызова
    counter = {"n": 0}

    async def fake_naming(_db, _niche, _samples):
        counter["n"] += 1
        return {"label": f"label-{counter['n']}", "description": "desc"}

    monkeypatch.setattr(ai_service.llm, "call_llm_cluster_naming", fake_naming)

    async with AsyncSessionLocal() as db:
        co = await _setup_user_and_company(db, niche=niche, city=city)

        # Старый PainTag — должен быть archived
        old_tag = PainTag(
            niche=niche, city=city, label=_u("old"),
            centroid=_vec([0.5, 0.5, 0.0]), status="active",
        )
        db.add(old_tag)
        await db.commit()
        await db.refresh(old_tag)

        # Добавляем 24 отзыва в 3 группах (по 8 в группе — порог min_cluster_size=8)
        from sqlalchemy import text as sa_text
        directions = ([[1.0, 0.0, 0.0]] * 8) + ([[0.0, 1.0, 0.0]] * 8) + ([[0.0, 0.0, 1.0]] * 8)
        for i, d in enumerate(directions):
            text_i = f"recluster-{i}-{uuid.uuid4()}"
            await maps_service.save_reviews_batch(db, co.id, [
                ReviewRaw(source="2gis", rating=3, raw_text=text_i),
            ])
            review = (await db.execute(
                select(Review).where(Review.company_id == co.id, Review.raw_text == text_i)
            )).scalar_one()
            # шум 0.001 в первой компоненте чтобы HDBSCAN не схлопывал в одну точку
            jitter = [v + ((-1) ** i) * 0.001 for v in d]
            v = _vec(jitter)
            await db.execute(
                sa_text("UPDATE reviews SET embedding = :v WHERE id = :id"),
                {"v": str(v), "id": review.id},
            )
        await db.commit()

        n_tags = await ai_service.recluster_pains_for_niche(
            db, niche, city, min_cluster_size=8,
        )
        assert n_tags >= 1, "должен создаться хотя бы один кластер"

        # Старый тег → archived
        await db.refresh(old_tag)
        assert old_tag.status == "archived"

        # Есть свежие active теги с label из мок-функции
        new_tags = list((await db.execute(
            select(PainTag).where(
                PainTag.niche == niche, PainTag.city == city,
                PainTag.status == "active",
            )
        )).scalars().all())
        assert len(new_tags) == n_tags
        assert all(t.label.startswith("label-") for t in new_tags)
