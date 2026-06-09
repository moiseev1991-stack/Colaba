"""Сервис reviews_ai: sentiment, embeddings, match к pain_tags, recluster.

Все функции gracefully отключаются при отсутствии нужных средств:
- если call_llm_sentiment вернул None → reviews.sentiment остаётся как был (derived from rating)
- если embed_texts вернул None → reviews.embedding остаётся NULL
- если call_llm_cluster_naming вернул None → используется fallback label «Кластер N»
"""

from __future__ import annotations

import logging
import random
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import numpy as np
from sqlalchemy import case, func, or_, select, update, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.maps import Company, Review
from app.models.pain_tag import CompanyPainScore, PainTag, ReviewPainTag
from app.modules.reviews_ai import llm
from app.modules.reviews_ai.clustering import cluster_embeddings, compute_centroid

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Sentiment
# ---------------------------------------------------------------------------


SENTIMENT_BATCH_SIZE = 20  # сколько отзывов отдаём в один LLM-вызов


async def compute_sentiment(db: AsyncSession, review_ids: list[int]) -> int:
    """Гоняет батчи отзывов через LLM и обновляет reviews.sentiment/sentiment_score.

    Бьём по SENTIMENT_BATCH_SIZE, чтобы JSON-ответ умещался в max_tokens
    модели и не обрезался (на 100 отзывов одного вызова gpt-4o-mini не хватает).
    Если LLM недоступен или вернул мусор — пропускаем батч, не падаем.
    Возвращает количество обновлённых строк.
    """
    if not review_ids:
        return 0

    rows = list((await db.execute(
        select(Review.id, Review.raw_text).where(Review.id.in_(review_ids))
    )).all())
    payload = [
        {"id": int(r[0]), "text": (r[1] or "")[:1500]}
        for r in rows
        if r[1]  # без текста LLM не нужен
    ]
    if not payload:
        return 0

    valid_labels = {"positive", "negative", "neutral"}
    updated = 0
    for i in range(0, len(payload), SENTIMENT_BATCH_SIZE):
        batch = payload[i:i + SENTIMENT_BATCH_SIZE]
        result = await llm.call_llm_sentiment(db, batch)
        if not result:
            continue
        for item in result:
            if not isinstance(item, dict):
                continue
            rid = item.get("id")
            label = (item.get("sentiment") or "").lower()
            if rid is None or label not in valid_labels:
                continue
            try:
                score = float(item.get("score", 0.5))
            except (TypeError, ValueError):
                score = 0.5
            score = max(0.0, min(1.0, score))
            await db.execute(
                update(Review)
                .where(Review.id == int(rid))
                .values(sentiment=label, sentiment_score=score)
            )
            updated += 1
        await db.commit()
    return updated


# ---------------------------------------------------------------------------
# Embeddings
# ---------------------------------------------------------------------------


async def compute_embeddings(db: AsyncSession, review_ids: list[int]) -> int:
    """Вычисляет embeddings и проставляет reviews.embedding. Возвращает count."""
    if not review_ids:
        return 0
    rows = list((await db.execute(
        select(Review.id, Review.raw_text).where(Review.id.in_(review_ids), Review.raw_text.isnot(None))
    )).all())
    if not rows:
        return 0
    texts = [(r[1] or "")[:2000] for r in rows]
    vectors = await llm.embed_texts(texts)
    if not vectors:
        return 0

    updated = 0
    for (rid, _txt), vec in zip(rows, vectors):
        await db.execute(
            update(Review).where(Review.id == int(rid)).values(embedding=vec)
        )
        updated += 1
    await db.commit()
    return updated


# ---------------------------------------------------------------------------
# Pain matching
# ---------------------------------------------------------------------------


async def _pain_tags_for_niche(db: AsyncSession, niche: str, city: str | None) -> list[PainTag]:
    """Активные pain_tags для (niche, city) — а также глобальные (city=NULL) для этой ниши."""
    q = (
        select(PainTag)
        .where(
            PainTag.niche == niche,
            PainTag.status == "active",
        )
    )
    if city is not None:
        q = q.where((PainTag.city == city) | (PainTag.city.is_(None)))
    else:
        q = q.where(PainTag.city.is_(None))
    return list((await db.execute(q)).scalars().all())


async def match_reviews_to_pain_tags(
    db: AsyncSession,
    review_ids: list[int],
    threshold: float | None = None,
    force_niche: str | None = None,
    force_city: str | None = None,
) -> dict[int, list[int]]:
    """Для каждого review_id, для которого есть embedding, ищет ближайшие pain_tags
    той же ниши (и города компании или глобальные для ниши) через cosine similarity.

    Сохраняет matches в review_pain_tags и пересчитывает company_pain_scores.
    Возвращает {review_id: [pain_tag_id, ...]} только для назначенных.

    force_niche/force_city — если переданы, игнорируем Company.niche/Company.city
    и считаем все reviews одной группой под этой ниша/город. Нужно когда
    recluster делается для конкретного поиска: у Company.niche в БД может
    стоять формулировка из источника («Стоматологические клиники»), которая
    не совпадает с search.niche («стоматология»), и без переопределения
    match сматчит отзывы только с тегами «старой» ниши, а свежесозданные
    теги нужной ниши останутся неприсвоенными.
    """
    if not review_ids:
        return {}
    threshold = threshold if threshold is not None else settings.REVIEWS_AI_PAIN_MATCH_THRESHOLD

    # Берём reviews с embedding + niche/city компании + raw_text (для top_quote).
    #
    # ВАЖНО: пропускаем positive-отзывы. Pain-теги — это «боли клиентов», и
    # позитивные отзывы туда привязываться не должны: cosine-similarity по
    # embedding'у легко даёт высокий sim между pain-тегом «Качество еды и
    # сервиса» и позитивным «Очень вкусная кухня, вежливый персонал», и тогда
    # такой positive-отзыв становится top_quote pain-тега → в UI карточки
    # под красным «негатив 19» висит благодарственная цитата. Аудит ловил.
    #
    # Условие `sentiment != 'positive'` — а не `IN ('negative','neutral')`,
    # потому что у части старых отзывов sentiment ещё NULL (AI-пайплайн не
    # прогонял), и их terять нельзя — пусть проходят как раньше.
    rows = list((await db.execute(
        select(
            Review.id, Review.company_id, Review.embedding, Review.raw_text,
            Company.niche, Company.city,
        )
        .join(Company, Company.id == Review.company_id)
        .where(
            Review.id.in_(review_ids),
            Review.embedding.isnot(None),
            or_(Review.sentiment.is_(None), Review.sentiment != "positive"),
        )
    )).all())
    if not rows:
        return {}

    # Группируем по (niche, city) чтобы один раз достать pain_tags на пару.
    # При force_niche — все отзывы под одной парой (force_niche, force_city),
    # независимо от Company.niche/Company.city.
    by_niche_city: dict[tuple[str, str | None], list[tuple]] = defaultdict(list)
    for r in rows:
        key = (force_niche, force_city) if force_niche else (r[4], r[5])
        by_niche_city[key].append(r)

    assigned: dict[int, list[int]] = {}
    now = datetime.now(timezone.utc)

    for (niche, city), bucket in by_niche_city.items():
        if not niche:
            continue
        tags = await _pain_tags_for_niche(db, niche, city)
        tags_with_c = [(t, np.asarray(list(t.centroid), dtype=np.float64))
                       for t in tags if t.centroid is not None]
        if not tags_with_c:
            continue

        # ---------- ВЕКТОРНЫЙ COSINE: R @ T.T за один matmul ----------
        # До рефакторинга: Python-цикл считал N*M dot product'ов и делал
        # N*M*2 DB-roundtrip'ов (по два upsert на (review, tag)). На 3к
        # отзывов × 10 тегов это десятки секунд — отсюда жалоба «Готовы
        # 1 из 73 · 6 минут». Теперь cosine — один numpy matmul (милисек),
        # DB-операции свёрнуты в bulk через executemany. Логика top_quote
        # сохранена: побеждает отзыв с максимальным sim в (company, tag).
        review_matrix = np.asarray([list(r[2]) for r in bucket], dtype=np.float64)
        tag_matrix = np.asarray([c for _, c in tags_with_c], dtype=np.float64)
        # Нормализация по строкам — потом cosine = dot product
        r_norm = np.linalg.norm(review_matrix, axis=1, keepdims=True)
        r_norm[r_norm == 0] = 1.0
        t_norm = np.linalg.norm(tag_matrix, axis=1, keepdims=True)
        t_norm[t_norm == 0] = 1.0
        sim_matrix = (review_matrix / r_norm) @ (tag_matrix / t_norm).T
        # Маска: какие (review_idx, tag_idx) выше threshold
        hit_indices = np.argwhere(sim_matrix >= threshold)
        if hit_indices.size == 0:
            continue

        # ---------- Подготовка bulk-данных ----------
        # review_pain_tags: список (review_id, pain_tag_id, similarity)
        rpt_rows: list[dict] = []
        # CompanyPainScore: агрегация по (company_id, tag_id)
        # value = {"mention": int, "top_sim": float, "top_quote": str, "top_review_id": int}
        cps_agg: dict[tuple[int, int], dict] = {}

        for ridx, tidx in hit_indices:
            ridx = int(ridx)
            tidx = int(tidx)
            sim = float(sim_matrix[ridx, tidx])
            sim_rounded = round(sim, 3)
            rid = int(bucket[ridx][0])
            company_id = int(bucket[ridx][1])
            raw_text = bucket[ridx][3]
            tag_id = int(tags_with_c[tidx][0].id)

            rpt_rows.append({
                "review_id": rid, "pain_tag_id": tag_id, "similarity": sim_rounded,
            })

            quote_text = (raw_text or "").strip()
            if len(quote_text) > 280:
                quote_text = quote_text[:277].rstrip() + "..."

            key = (company_id, tag_id)
            cur = cps_agg.get(key)
            if cur is None:
                cps_agg[key] = {
                    "mention": 1,
                    "top_sim": sim_rounded if quote_text else 0,
                    "top_quote": quote_text or None,
                    "top_review_id": rid if quote_text else None,
                }
            else:
                cur["mention"] += 1
                if quote_text and sim_rounded > cur["top_sim"]:
                    cur["top_sim"] = sim_rounded
                    cur["top_quote"] = quote_text
                    cur["top_review_id"] = rid

            assigned.setdefault(rid, []).append(tag_id)

        # ---------- Bulk INSERT review_pain_tags ----------
        if rpt_rows:
            rpt_ins = (
                pg_insert(ReviewPainTag)
                .values(rpt_rows)
                .on_conflict_do_update(
                    index_elements=["review_id", "pain_tag_id"],
                    set_={"similarity": pg_insert(ReviewPainTag).excluded.similarity},
                )
            )
            await db.execute(rpt_ins)

        # ---------- Bulk INSERT/UPDATE company_pain_scores ----------
        # Для каждой агрегированной пары делаем один upsert. Это всё ещё
        # M*N в худшем случае, но без cosine-loop'а — на порядок быстрее.
        # (Полностью bulk-upsert с CASE-merge mention_count невозможен в
        # одном SQL — Postgres ON CONFLICT не умеет агрегировать по
        # одинаковым ключам в одном VALUES; так что цикл по агрегатам.)
        table = CompanyPainScore.__table__
        for (company_id, tag_id), agg in cps_agg.items():
            cps_ins = pg_insert(CompanyPainScore).values(
                company_id=company_id,
                pain_tag_id=tag_id,
                mention_count=agg["mention"],
                first_mention_at=now,
                last_mention_at=now,
                top_quote=agg["top_quote"],
                top_quote_review_id=agg["top_review_id"],
                top_quote_similarity=agg["top_sim"] if agg["top_quote"] else None,
            )
            set_clause: dict = {
                "mention_count": table.c.mention_count + agg["mention"],
                "last_mention_at": now,
            }
            if agg["top_quote"]:
                cur_sim = func.coalesce(table.c.top_quote_similarity, 0)
                is_better = cps_ins.excluded.top_quote_similarity > cur_sim
                set_clause["top_quote"] = case(
                    (is_better, cps_ins.excluded.top_quote),
                    else_=table.c.top_quote,
                )
                set_clause["top_quote_review_id"] = case(
                    (is_better, cps_ins.excluded.top_quote_review_id),
                    else_=table.c.top_quote_review_id,
                )
                set_clause["top_quote_similarity"] = case(
                    (is_better, cps_ins.excluded.top_quote_similarity),
                    else_=table.c.top_quote_similarity,
                )
            cps_ins = cps_ins.on_conflict_do_update(
                index_elements=["company_id", "pain_tag_id"], set_=set_clause,
            )
            await db.execute(cps_ins)

        # ---------- Помечаем все сматченные отзывы обработанными ----------
        matched_review_ids = list(assigned.keys())
        if matched_review_ids:
            await db.execute(
                update(Review).where(Review.id.in_(matched_review_ids))
                .values(ai_processed_at=now)
            )

    await db.commit()
    return assigned


# ---------------------------------------------------------------------------
# Recluster
# ---------------------------------------------------------------------------


async def _archive_unused_pain_tags(
    db: AsyncSession,
    niche: str,
    city: str | None,
    keep_ids: set[int],
) -> None:
    """Помечает archived все active pain_tags данной (niche, city) кроме keep_ids."""
    q = (
        update(PainTag)
        .where(PainTag.niche == niche, PainTag.status == "active")
        .values(status="archived", updated_at=datetime.now(timezone.utc))
    )
    if city is None:
        q = q.where(PainTag.city.is_(None))
    else:
        q = q.where(PainTag.city == city)
    if keep_ids:
        q = q.where(PainTag.id.notin_(list(keep_ids)))
    await db.execute(q)


async def recluster_pains_for_niche(
    db: AsyncSession,
    niche: str,
    city: str | None = None,
    min_cluster_size: int | None = None,
    company_ids: list[int] | None = None,
) -> int:
    """1. Берём все reviews этой ниши+города с embeddings.
    2. HDBSCAN.
    3. Для каждого кластера: centroid + sample + LLM-name → UPSERT pain_tags.
    4. Старые активные pain_tags этой ниши (не в новом наборе) → archived.
    5. Сбрасываем review_pain_tags / company_pain_scores этой ниши и матчим заново.

    Если передан `company_ids` — фильтруем reviews ровно по этим компаниям
    (а не по Company.niche). Это нужно когда admin/recluster-niche
    запускают из конкретного поиска: у Company.niche может быть другая
    формулировка из источника (2GIS отдаёт «Стоматологические клиники»,
    а юзер искал «стоматология») — фильтр по niche в этом случае давал 0
    отзывов, recluster тихо ничего не создавал, UI висел на 70%.

    Возвращает количество созданных/обновлённых тегов.
    """
    min_cs = min_cluster_size if min_cluster_size is not None else settings.REVIEWS_AI_MIN_CLUSTER_SIZE

    # 1. Reviews этой ниши+города с embedding (либо по company_ids — см. docstring)
    base = (
        select(Review.id, Review.raw_text, Review.embedding, Review.company_id)
        .where(Review.embedding.isnot(None))
    )
    if company_ids:
        # Явный список компаний: фильтруем без JOIN на Company.niche/city
        base = base.where(Review.company_id.in_(company_ids))
    else:
        base = base.join(Company, Company.id == Review.company_id).where(
            Company.niche == niche
        )
        if city is not None:
            base = base.where(Company.city == city)
    rows = list((await db.execute(base)).all())
    logger.info(
        "recluster %r/%r: взяли %d reviews с embedding (company_ids=%s, min_cs=%d)",
        niche, city, len(rows),
        f"{len(company_ids)} ids" if company_ids else "by Company.niche",
        min_cs,
    )
    if len(rows) < min_cs:
        logger.warning(
            "recluster %r/%r: ABORT — только %d reviews с embedding, нужно ≥%d",
            niche, city, len(rows), min_cs,
        )
        return 0

    embeddings = np.asarray([list(r[2]) for r in rows], dtype=np.float64)
    labels = cluster_embeddings(embeddings, min_cluster_size=min_cs)

    cluster_ids = sorted({int(l) for l in labels if l >= 0})
    if not cluster_ids:
        logger.warning(
            "recluster %r/%r: ABORT — кластеризация (HDBSCAN+kmeans fallback) вернула 0 кластеров на %d embeddings",
            niche, city, len(rows),
        )
        await _archive_unused_pain_tags(db, niche, city, keep_ids=set())
        await db.commit()
        return 0
    logger.info(
        "recluster %r/%r: нашли %d кластеров (размеры: %s)",
        niche, city, len(cluster_ids),
        ", ".join(str(int(np.sum(labels == cid))) for cid in cluster_ids[:10]),
    )

    # 2-3. Для каждого кластера: centroid + label
    rng = random.Random(42)
    upserted_ids: set[int] = set()
    now = datetime.now(timezone.utc)

    for cidx in cluster_ids:
        member_idx = [i for i, l in enumerate(labels) if int(l) == cidx]
        member_emb = embeddings[member_idx]
        centroid = compute_centroid(member_emb)

        # sample до 10 текстов кластера
        sample_indices = member_idx if len(member_idx) <= 10 else rng.sample(member_idx, 10)
        sample_texts = [rows[i][1] for i in sample_indices if rows[i][1]]

        named = await llm.call_llm_cluster_naming(db, niche, sample_texts)
        if named:
            label = named["label"]
            description = named.get("description") or None
        else:
            # Fallback label, если LLM недоступен
            label = f"Кластер {cidx + 1}"
            description = None

        examples = [
            {"text_hash": None, "text_preview": (rows[i][1] or "")[:100]}
            for i in sample_indices[:5]
        ]

        ins = pg_insert(PainTag).values(
            niche=niche, city=city, label=label,
            description=description,
            occurrences_count=len(member_idx),
            cluster_size=len(member_idx),
            examples=examples,
            status="active",
            created_at=now, updated_at=now,
        )
        # ON CONFLICT по основному UNIQUE — если city не NULL
        # NB: для (niche, city=NULL, label) используется частичный индекс ux_pain_tags_global;
        # SQLAlchemy/pg_insert с on_conflict не умеет красиво работать с частичными индексами по-разному
        # для двух случаев, поэтому для упрощения — на конфликт основного UNIQUE.
        ins = ins.on_conflict_do_update(
            index_elements=["niche", "city", "label"],
            set_={
                "description": ins.excluded.description,
                "centroid": centroid.tolist(),
                "occurrences_count": ins.excluded.occurrences_count,
                "cluster_size": ins.excluded.cluster_size,
                "examples": ins.excluded.examples,
                "status": "active",
                "updated_at": now,
            },
        ).returning(PainTag.id)
        # centroid отдельно через UPDATE (insert above values() не включал centroid из-за типа)
        result = await db.execute(ins)
        tag_id = result.scalar_one()
        # Гарантируем centroid: ON CONFLICT-кейс выше уже его обновляет в excluded;
        # для INSERT-кейса — ставим явным UPDATE (insert.values() не передал centroid).
        await db.execute(
            text("UPDATE pain_tags SET centroid = :v WHERE id = :id"),
            {"v": str(centroid.tolist()), "id": int(tag_id)},
        )
        upserted_ids.add(int(tag_id))

    # 4. Архивируем неиспользуемые теги этой (niche, city)
    await _archive_unused_pain_tags(db, niche, city, keep_ids=upserted_ids)

    # 5. Чистим связки для этой ниши и матчим заново
    review_ids = [int(r[0]) for r in rows]
    if review_ids:
        await db.execute(
            text("DELETE FROM review_pain_tags WHERE review_id = ANY(:ids)"),
            {"ids": review_ids},
        )
        # company_pain_scores: чистим по компаниям, чьи отзывы кластеризовали,
        # — связки с pain_tags этой search-niche, чтобы пересчитать.
        # (Локальное имя — отдельное от параметра company_ids, который пришёл
        # в функцию извне; именно reviews-set даёт нам правильный список.)
        member_company_ids = list({int(r[3]) for r in rows})
        await db.execute(
            text(
                "DELETE FROM company_pain_scores WHERE company_id = ANY(:ids) "
                "AND pain_tag_id IN (SELECT id FROM pain_tags WHERE niche = :n)"
            ),
            {"ids": member_company_ids, "n": niche},
        )

    await db.commit()

    # Заново матчим. Если recluster был вызван с явным company_ids — у этих
    # компаний Company.niche может НЕ совпадать с нашим niche; передаём
    # force_niche/force_city, чтобы match искал теги именно нашей пары
    # (niche, city) — то есть тех, которые мы только что создали.
    assigned = await match_reviews_to_pain_tags(
        db,
        review_ids,
        force_niche=niche if company_ids else None,
        force_city=city if company_ids else None,
    )
    logger.info(
        "recluster %r/%r: DONE — %d тегов upserted, %d reviews сматчено к тегам",
        niche, city, len(upserted_ids), len(assigned),
    )

    return len(upserted_ids)


# ---------------------------------------------------------------------------
# Full pipeline (used by Celery analyze_reviews_for_company)
# ---------------------------------------------------------------------------


async def process_reviews_pipeline(db: AsyncSession, review_ids: list[int]) -> dict[str, int]:
    """Полный пайплайн: sentiment → embeddings → match → mark ai_processed_at.

    Возвращает статистику по этапам. Если pain_tags ещё нет для ниши — match
    просто ничего не назначит (создание тегов выполняет recluster_pains_for_niche).
    """
    if not review_ids:
        return {"sentiment": 0, "embeddings": 0, "matched": 0}

    sentiment_n = await compute_sentiment(db, review_ids)
    embeddings_n = await compute_embeddings(db, review_ids)
    assigned = await match_reviews_to_pain_tags(db, review_ids)
    # помечаем все обработанные (даже если матч пустой)
    now = datetime.now(timezone.utc)
    await db.execute(
        update(Review).where(Review.id.in_(review_ids), Review.ai_processed_at.is_(None))
        .values(ai_processed_at=now)
    )
    await db.commit()
    return {
        "sentiment": sentiment_n,
        "embeddings": embeddings_n,
        "matched": sum(len(v) for v in assigned.values()),
    }
