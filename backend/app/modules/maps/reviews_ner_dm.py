"""NER имён сотрудников по отзывам клиентов (2026-07-16).

Юзер (Дима, 16.07): «в 2GIS/Яндексе часто пишут "спасибо Марине из отдела
маркетинга" — надо вытаскивать имена+должности LLM'ом из уже спарсенных
отзывов». Даёт +имена там, где сайт мёртвый / ВК/hh/ЕГРЮЛ ничего не дали.

Логика
------
1. Собираем raw_text последних ~30 отзывов компании (raw_text_purged_at
   ещё не отработал; текст не пуст). Приоритет — те, что явно содержат
   ключевые слова «спасибо», «врач», «мастер», «администратор» и т.п.
2. Отправляем LLM `call_llm_extract_from_reviews` — на выходе
   `[{name, post, role_category, mentions_count}]`.
3. Сохраняем в company_decision_makers с source='reviews_ner',
   confidence = 0.35 (одиночное упоминание) до 0.6 (≥3 упоминаний).
   Одно имя = одна запись благодаря UNIQUE-индексу (company_id, lower(name))
   + ON CONFLICT DO NOTHING.

confidence
----------
Отзывы — самый шумный источник ЛПР (там могут упоминаться клиенты,
персонажи, врачи из соседних клиник). Поэтому базовый confidence
низкий:
  1 упоминание  → 0.35
  2 упоминания  → 0.45
  3+ упоминаний → 0.55

Оркестратор enrich_marketing_dm по правилам sorting поднимет marketing/
management-роль выше «other», но для best-DM отдаст приоритет ЛПР с
контактом. Персон из отзывов contact_value=None — они попадают в блок
«Прочие ЛПР» UI, но именно они помогают собеседнику написать письмо
«Здравствуйте, Марина» вместо холодного «Здравствуйте!».

Идемпотентность
---------------
Skip если у компании уже есть >=1 запись source='reviews_ner' младше
30 дней. Повторный прогон делается только через force-флаг (пока не
экспонирован в UI — админский re-parse).
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company_decision_maker import CompanyDecisionMaker
from app.models.maps import Company, Review
from app.modules.reviews_ai.llm import call_llm_extract_from_reviews


logger = logging.getLogger(__name__)


_MAX_REVIEWS_FOR_NER = 30
_MIN_TEXT_LEN = 20
_REPROCESS_AFTER_DAYS = 30


def _confidence_from_mentions(mentions_count: int) -> float:
    if mentions_count >= 3:
        return 0.55
    if mentions_count == 2:
        return 0.45
    return 0.35


async def enrich_dm_from_reviews(
    db: AsyncSession,
    company_id: int,
    *,
    force: bool = False,
) -> dict:
    """Достаёт имена сотрудников из raw_text отзывов и пишет в
    company_decision_makers c source='reviews_ner'.

    Возвращает dict-сводку: сколько отзывов взято, сколько персон извлечено,
    сколько реально записано (после дедупа по UNIQUE-индексу).
    """
    company = await db.get(Company, company_id)
    if company is None:
        return {"status": "not_found_company"}

    # Идемпотентность: если недавний прогон уже был — пропускаем.
    if not force:
        cutoff = datetime.now(timezone.utc) - timedelta(days=_REPROCESS_AFTER_DAYS)
        recent_ner = (await db.execute(
            select(CompanyDecisionMaker.id)
            .where(CompanyDecisionMaker.company_id == company_id)
            .where(CompanyDecisionMaker.source == "reviews_ner")
            .where(CompanyDecisionMaker.created_at >= cutoff)
            .limit(1)
        )).scalar_one_or_none()
        if recent_ner is not None:
            return {"status": "skip_already_processed"}

    # Берём последние отзывы с непустым текстом. По posted_at desc, чтобы
    # свежие имена (2026 год) шли раньше древних (2019). raw_text может быть
    # NULL после cron-очистки — таких пропускаем.
    rows = (await db.execute(
        select(Review.raw_text)
        .where(Review.company_id == company_id)
        .where(Review.raw_text.isnot(None))
        .order_by(Review.posted_at.desc().nullslast())
        .limit(_MAX_REVIEWS_FOR_NER * 2)  # запас, часть отфильтруем по длине
    )).all()

    texts = [
        (r[0] or "").strip()
        for r in rows
        if r[0] and len(r[0].strip()) >= _MIN_TEXT_LEN
    ][:_MAX_REVIEWS_FOR_NER]

    if not texts:
        return {"status": "no_reviews_with_text", "texts": 0, "saved": 0}

    extracted = await call_llm_extract_from_reviews(
        db, company_name=company.name or "", review_texts=texts,
    )
    if extracted is None:
        return {"status": "llm_unavailable", "texts": len(texts), "saved": 0}
    if not extracted:
        return {"status": "no_persons", "texts": len(texts), "saved": 0}

    saved = 0
    for item in extracted:
        name = (item.get("name") or "").strip()
        if not name:
            continue
        post = item.get("post")
        role_category = item.get("role_category")
        mentions_count = int(item.get("mentions_count") or 1)
        confidence = _confidence_from_mentions(mentions_count)

        # is_decision_maker: только явные «management»/«marketing»/«owner»/«founder».
        # «other» (стоматолог, повар, администратор) — не ЛПР, но пишем как
        # сотрудник компании — юзер увидит имя для «здравствуйте, Марина!».
        is_dm = role_category in ("marketing", "owner", "founder", "management")

        stmt = pg_insert(CompanyDecisionMaker).values(
            company_id=company_id,
            name=name,
            post=post,
            source="reviews_ner",
            source_url=None,
            confidence=confidence,
            is_decision_maker=is_dm,
            role_category=role_category,
            contact_type=None,
            contact_value=None,
        ).on_conflict_do_nothing()
        try:
            await db.execute(stmt)
            saved += 1
        except Exception as e:
            # Гонка по UNIQUE (company_id, lower(name)) — норма, тихо.
            logger.debug(
                "enrich_dm_from_reviews: insert conflict for %s: %s",
                name, e,
            )

    await db.commit()
    return {
        "status": "ok",
        "texts": len(texts),
        "extracted": len(extracted),
        "saved": saved,
    }
