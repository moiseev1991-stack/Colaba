"""Сервис для AI-анализа компаний под кастомный промпт из пресета.

Логика:
- Для каждой (company, prompt_hash, user) храним результат в company_ai_analyses.
- Перед LLM-запросом проверяем кэш — повторный клик не платит.
- Лимит на юзера: AI_ANALYSIS_DAILY_LIMIT строк, созданных за последние 24 часа.
- LLM вызывается через reviews_ai.llm.call_llm_custom_analysis (gpt-4o-mini
  через ProxyAPI).
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company_ai_analysis import CompanyAiAnalysis
from app.models.maps import Company, Review

logger = logging.getLogger(__name__)


# Защита от случайного слива баланса ProxyAPI. Считаются ВСЕ rows
# company_ai_analyses, созданные пользователем за последние 24 часа,
# включая failed (потому что fail = тоже потраченный токен).
AI_ANALYSIS_DAILY_LIMIT = 100


def prompt_hash(prompt: str) -> str:
    """Стабильный SHA-256 от нормализованного промпта."""
    normalized = (prompt or "").strip()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


async def count_today(db: AsyncSession, user_id: int) -> int:
    """Сколько AI-анализов юзер сделал за последние 24 часа."""
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    stmt = (
        select(func.count(CompanyAiAnalysis.id))
        .where(
            CompanyAiAnalysis.user_id == user_id,
            CompanyAiAnalysis.created_at >= since,
        )
    )
    return int((await db.execute(stmt)).scalar_one())


async def get_existing(
    db: AsyncSession,
    *,
    user_id: int,
    company_ids: list[int],
    prompt_hash_value: str,
) -> dict[int, CompanyAiAnalysis]:
    """Возвращает {company_id: row} для уже посчитанных под этот промпт."""
    if not company_ids:
        return {}
    rows = (await db.execute(
        select(CompanyAiAnalysis)
        .where(
            CompanyAiAnalysis.user_id == user_id,
            CompanyAiAnalysis.prompt_hash == prompt_hash_value,
            CompanyAiAnalysis.company_id.in_(company_ids),
        )
    )).scalars().all()
    return {int(r.company_id): r for r in rows}


async def ensure_pending_row(
    db: AsyncSession,
    *,
    user_id: int,
    company_id: int,
    prompt_hash_value: str,
) -> bool:
    """Создаёт строку со status='pending' через ON CONFLICT DO NOTHING.

    Возвращает True если строка создана сейчас (значит таску надо ставить),
    False если уже была (значит юзер дважды кликнул — пропускаем).
    """
    now = datetime.now(timezone.utc)
    ins = pg_insert(CompanyAiAnalysis).values(
        user_id=user_id,
        company_id=company_id,
        prompt_hash=prompt_hash_value,
        status="pending",
        created_at=now,
        updated_at=now,
    ).on_conflict_do_nothing(
        index_elements=["company_id", "prompt_hash", "user_id"],
    ).returning(CompanyAiAnalysis.id)
    result = await db.execute(ins)
    await db.commit()
    return result.scalar_one_or_none() is not None


async def gather_company_context(
    db: AsyncSession, company_id: int,
) -> dict[str, Any] | None:
    """Собирает данные о компании + до 5 sample отзывов для LLM-промпта."""
    company = await db.get(Company, company_id)
    if company is None:
        return None
    reviews = (await db.execute(
        select(Review.raw_text, Review.sentiment)
        .where(Review.company_id == company_id, Review.raw_text.isnot(None))
        .order_by(Review.posted_at.desc().nullslast())
        .limit(5)
    )).all()
    sample_reviews = [str(r[0]) for r in reviews if r[0]]
    return {
        "company_name": company.name or "",
        "niche": company.niche or "",
        "city": company.city or "",
        "rating": float(company.rating) if company.rating is not None else None,
        "reviews_count": int(company.reviews_count or 0),
        "negative_count": int(company.reviews_negative_count or 0),
        "has_owner_replies": bool(company.has_owner_replies),
        "sample_reviews": sample_reviews,
    }


async def write_result(
    db: AsyncSession,
    *,
    user_id: int,
    company_id: int,
    prompt_hash_value: str,
    score: int | None,
    comment: str | None,
    status: str,
    error: str | None = None,
) -> None:
    """UPDATE существующей pending-строки на финальный результат."""
    from sqlalchemy import update
    now = datetime.now(timezone.utc)
    await db.execute(
        update(CompanyAiAnalysis)
        .where(
            CompanyAiAnalysis.user_id == user_id,
            CompanyAiAnalysis.company_id == company_id,
            CompanyAiAnalysis.prompt_hash == prompt_hash_value,
        )
        .values(
            score=score, comment=comment,
            status=status, error=error,
            updated_at=now,
        )
    )
    await db.commit()
