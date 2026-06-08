"""Агрегатор болей на уровне ниши (MVP, без LLM-кластеризации).

Идея юзера 2026-06-08: после завершения поиска по нише+городу строить
сводное «облако болей всего рынка». В отличие от диагноза по компании
(который у нас уже работает) — здесь ответ на вопрос «какие 5-10 главных
проблем у клиентов в этой нише вообще».

MVP-алгоритм (без LLM):
  1. Берём все company_pain_scores по компаниям выдачи.
  2. GROUP BY pain_tag_id → label, count(distinct company), sum(mention).
  3. frequency_pct = company_count / total_companies_in_search * 100.
  4. Для каждого кластера тянем топ-5 цитат (max sample_quotes).
  5. UPSERT в niche_pain_clusters.

Будущее улучшение (если надо):
  - Объединять близкие pain_tags разных компаний по семантике через
    embedding-кластеризацию на уровне labels. Схема таблицы не меняется —
    pain_tag_ids уже массив.
  - LLM-имя кластера, если несколько pain_tags объединились
    (cluster_label != pain_tag.label).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.maps import MapSearch, MapSearchResult
from app.models.niche_pain_cluster import NichePainCluster

logger = logging.getLogger(__name__)


async def aggregate_niche_pain_clusters(
    db: AsyncSession,
    search_id: int,
    *,
    top_n: int = 20,
) -> int:
    """Пересчитывает niche_pain_clusters для одного поиска.

    Возвращает количество сохранённых кластеров. Идемпотентно: повторный
    вызов UPSERT'ит уже существующие cluster_label, удаляет «осиротевшие»
    (которые ушли из топ-N при пересчёте).
    """
    search = await db.get(MapSearch, search_id)
    if search is None:
        logger.warning("aggregate_niche_pain_clusters: search %d not found", search_id)
        return 0

    # Всего компаний в выдаче (база для процента) — считаем без фильтрации
    # по «есть ли pain», иначе % будут завышены.
    total_q = select(MapSearchResult.company_id).where(
        MapSearchResult.map_search_id == search_id
    )
    total_companies = len((await db.execute(total_q)).all())
    if total_companies == 0:
        logger.info("aggregate_niche_pain_clusters: search %d has 0 companies", search_id)
        return 0

    # Главный агрегатор: по каждому pain_tag — сколько уникальных компаний
    # и суммарных упоминаний. Дополнительно тянем label + первую цитату
    # с max top_quote_similarity (для семпла).
    sql = text(
        """
        WITH per_pain AS (
            SELECT
                cps.pain_tag_id,
                pt.label,
                COUNT(DISTINCT cps.company_id) AS company_count,
                SUM(cps.mention_count) AS total_mentions
            FROM company_pain_scores cps
            JOIN pain_tags pt ON pt.id = cps.pain_tag_id AND pt.status = 'active'
            JOIN map_search_results msr ON msr.company_id = cps.company_id
            WHERE msr.map_search_id = :sid
            GROUP BY cps.pain_tag_id, pt.label
            HAVING COUNT(DISTINCT cps.company_id) >= 1
        )
        SELECT pain_tag_id, label, company_count, total_mentions
        FROM per_pain
        ORDER BY company_count DESC, total_mentions DESC
        LIMIT :limit
        """
    )
    rows = (
        await db.execute(sql, {"sid": search_id, "limit": int(top_n)})
    ).mappings().all()

    if not rows:
        # Нет ни одной pain — очистим старые кластеры этого поиска (если были
        # с прошлой итерации, когда pain были).
        await db.execute(
            text("DELETE FROM niche_pain_clusters WHERE search_id = :sid"),
            {"sid": search_id},
        )
        await db.commit()
        return 0

    # Семплы цитат: для каждого pain_tag берём топ-5 цитат среди компаний выдачи
    # с непустым top_quote — для UI «вот живой текст жалобы».
    pain_ids = [int(r["pain_tag_id"]) for r in rows]
    quotes_sql = text(
        """
        SELECT pain_tag_id, top_quote, c.name AS company_name, cps.last_mention_at
        FROM company_pain_scores cps
        JOIN companies c ON c.id = cps.company_id
        JOIN map_search_results msr ON msr.company_id = cps.company_id
        WHERE msr.map_search_id = :sid
          AND cps.pain_tag_id = ANY(:pids)
          AND cps.top_quote IS NOT NULL
          AND length(trim(cps.top_quote)) > 0
        ORDER BY cps.pain_tag_id, cps.top_quote_similarity DESC NULLS LAST, cps.mention_count DESC
        """
    )
    qrows = (
        await db.execute(quotes_sql, {"sid": search_id, "pids": pain_ids})
    ).mappings().all()
    quotes_by_pain: dict[int, list[dict]] = {}
    for qr in qrows:
        pid = int(qr["pain_tag_id"])
        bucket = quotes_by_pain.setdefault(pid, [])
        if len(bucket) >= 5:
            continue
        bucket.append({
            "quote": qr["top_quote"],
            "company_name": qr["company_name"],
            "posted_at": qr["last_mention_at"].isoformat() if qr["last_mention_at"] else None,
        })

    # UPSERT каждой строки. Используем cluster_label = pt.label (MVP).
    now = datetime.now(timezone.utc)
    kept_labels: list[str] = []
    for r in rows:
        label = r["label"]
        kept_labels.append(label)
        cnt = int(r["company_count"] or 0)
        freq_pct = (Decimal(cnt) * Decimal(100) / Decimal(total_companies)).quantize(Decimal("0.01"))
        stmt = pg_insert(NichePainCluster).values(
            search_id=search_id,
            niche=search.niche,
            city=search.city,
            cluster_label=label,
            pain_tag_ids=[int(r["pain_tag_id"])],
            company_count=cnt,
            frequency_pct=freq_pct,
            total_mentions=int(r["total_mentions"] or 0),
            sample_quotes=quotes_by_pain.get(int(r["pain_tag_id"]), []),
            generated_at=now,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["search_id", "cluster_label"],
            set_={
                "pain_tag_ids": stmt.excluded.pain_tag_ids,
                "company_count": stmt.excluded.company_count,
                "frequency_pct": stmt.excluded.frequency_pct,
                "total_mentions": stmt.excluded.total_mentions,
                "sample_quotes": stmt.excluded.sample_quotes,
                "generated_at": stmt.excluded.generated_at,
                "niche": stmt.excluded.niche,
                "city": stmt.excluded.city,
            },
        )
        await db.execute(stmt)

    # Удалить «осиротевшие» кластеры (которые ушли из топ-N).
    await db.execute(
        text(
            """
            DELETE FROM niche_pain_clusters
            WHERE search_id = :sid AND cluster_label <> ALL(:labels)
            """
        ),
        {"sid": search_id, "labels": kept_labels},
    )
    await db.commit()
    logger.info(
        "aggregate_niche_pain_clusters: search %d → %d clusters (total companies %d)",
        search_id, len(rows), total_companies,
    )
    return len(rows)
