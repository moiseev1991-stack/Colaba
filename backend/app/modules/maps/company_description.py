"""AI-описание компании для блока «Производство сайта» (блок 4C ТЗ 2026-06-02).

Генерируется в фоне Celery-таском (см. tasks.py:generate_company_description).
Кэшируется в companies.ai_description, дата — companies.ai_description_generated_at.

Триггер на генерацию:
- Автоматически при /maps/website-leads/export — для каждой website-лид
  компании без ai_description ставится Celery-таск. Юзер получает Excel
  с тем что уже есть; повторный экспорт через 2-3 минуты получит
  заполненные описания.
- Вручную через POST /maps/admin/queue-descriptions.

Re-generation: пересоздание не делаем автоматически. Если нужно
обновить — вручную обнулить ai_description и поставить таск.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.maps import Company, Review
from app.modules.reviews_ai.llm import call_llm_company_description


logger = logging.getLogger(__name__)


async def _load_positive_quotes(
    db: AsyncSession, company_id: int, limit: int = 5
) -> list[str]:
    """Берёт до N коротких позитивных отзывов компании."""
    stmt = (
        select(Review.raw_text)
        .where(Review.company_id == company_id)
        .where(Review.sentiment == "positive")
        .where(Review.raw_text.isnot(None))
        .order_by(Review.posted_at.desc().nullslast())
        .limit(20)
    )
    rows = (await db.execute(stmt)).scalars().all()
    cleaned: list[str] = []
    seen: set[str] = set()
    for r in rows:
        t = (r or "").strip().replace("\n", " ")
        if not t or len(t) < 20:
            continue
        t = t[:260]
        if t in seen:
            continue
        seen.add(t)
        cleaned.append(t)
        if len(cleaned) >= limit:
            break
    return cleaned


async def generate_for_company(
    db: AsyncSession, company_id: int, *, force: bool = False
) -> str | None:
    """Главный entry-point: генерит и сохраняет ai_description.

    Если описание уже есть и force=False — пропускаем и возвращаем существующее.
    Возвращает строку описания или None при ошибке/недоступном LLM.
    """
    company = await db.get(Company, company_id)
    if company is None:
        return None
    if company.ai_description and not force:
        return company.ai_description

    quotes = await _load_positive_quotes(db, company_id, limit=5)
    desc = await call_llm_company_description(
        db,
        company_name=company.name or "",
        niche=company.niche or "",
        city=company.city or "",
        rating=float(company.rating) if company.rating is not None else None,
        reviews_count=int(company.reviews_count or 0),
        positive_quotes=quotes,
    )
    if not desc:
        return None

    await db.execute(
        update(Company)
        .where(Company.id == company_id)
        .values(
            ai_description=desc,
            ai_description_generated_at=datetime.now(timezone.utc),
        )
    )
    await db.commit()
    return desc


async def find_company_ids_without_description(
    db: AsyncSession, company_ids: list[int]
) -> list[int]:
    """Из переданного списка ID вернёт только те, у кого ai_description NULL."""
    if not company_ids:
        return []
    stmt = (
        select(Company.id)
        .where(Company.id.in_(company_ids))
        .where(Company.ai_description.is_(None))
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)
