"""HTTP API модуля reviews_ai. Префикс /reviews-ai.

Endpoints:
- POST /reviews-ai/run-preset-analysis — для пресета с ai_prompt запустить
  LLM-анализ списка компаний (создаёт pending-rows + ставит Celery tasks).
- GET /reviews-ai/company-analyses — забрать текущие результаты по
  списку компаний + preset_id для UI-пуллинга.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.rate_limit import limiter
from app.models.user_filter_preset import UserFilterPreset
from app.modules.reviews_ai import preset_analysis_service as svc


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reviews-ai", tags=["reviews-ai"])


class RunPresetAnalysisIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    preset_id: int
    company_ids: list[int] = Field(..., min_length=1, max_length=200)


class RunPresetAnalysisOut(BaseModel):
    queued: int          # сколько новых задач реально поставлено
    cached: int          # сколько компаний уже было посчитано (взяли из БД)
    skipped: int         # сколько пропущено (уже pending, не дублируем)
    limit_remaining: int # сколько слотов осталось у юзера сегодня
    limit_total: int = svc.AI_ANALYSIS_DAILY_LIMIT
    over_limit: int = 0  # сколько не уехало в очередь из-за исчерпанного лимита


class CompanyAnalysisOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    company_id: int
    score: Optional[int] = None
    comment: Optional[str] = None
    status: str
    error: Optional[str] = None


@router.post("/run-preset-analysis", response_model=RunPresetAnalysisOut)
@limiter.limit("30/minute")
async def run_preset_analysis(
    request: Request,
    payload: RunPresetAnalysisIn,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Поставить AI-анализ компаний под промпт пресета.

    Логика:
      1. Проверяем что пресет принадлежит юзеру и у него непустой ai_prompt.
      2. По кэшу (company_id, prompt_hash, user_id) — пропускаем уже посчитанные.
      3. Проверяем лимит юзера на сегодня (последние 24 часа).
      4. Для каждой оставшейся company_id — создаём pending-row и ставим Celery.
    """
    preset = (await db.execute(
        select(UserFilterPreset).where(
            UserFilterPreset.id == payload.preset_id,
            UserFilterPreset.user_id == user_id,
        )
    )).scalar_one_or_none()
    if preset is None:
        raise HTTPException(status_code=404, detail="Пресет не найден")
    prompt = (preset.ai_prompt or "").strip()
    if not prompt:
        raise HTTPException(
            status_code=400,
            detail="У этого пресета нет AI-промпта. Добавь его в редактировании пресета.",
        )

    prompt_hash_value = svc.prompt_hash(prompt)
    existing = await svc.get_existing(
        db, user_id=user_id,
        company_ids=payload.company_ids,
        prompt_hash_value=prompt_hash_value,
    )

    # cached — где уже есть запись (любой статус, не дублируем)
    cached_ids = set(existing.keys())
    to_queue = [cid for cid in payload.company_ids if cid not in cached_ids]

    used_today = await svc.count_today(db, user_id)
    remaining = max(0, svc.AI_ANALYSIS_DAILY_LIMIT - used_today)

    # Если to_queue > remaining — обрезаем
    over = max(0, len(to_queue) - remaining)
    if over > 0:
        to_queue = to_queue[:remaining]

    # Локальный импорт Celery таски, чтобы не плодить циркулярки на импорте модуля
    from app.modules.reviews_ai.tasks import analyze_company_with_prompt

    queued = 0
    skipped = 0
    for cid in to_queue:
        created = await svc.ensure_pending_row(
            db, user_id=user_id, company_id=cid, prompt_hash_value=prompt_hash_value,
        )
        if not created:
            # уже была — кто-то параллельно поставил, пропускаем
            skipped += 1
            continue
        try:
            analyze_company_with_prompt.delay(user_id, cid, prompt, prompt_hash_value)
            queued += 1
        except Exception as e:
            logger.warning("run_preset_analysis: не смог поставить таску для company=%d: %s", cid, e)
            skipped += 1

    return RunPresetAnalysisOut(
        queued=queued,
        cached=len(cached_ids),
        skipped=skipped,
        limit_remaining=max(0, svc.AI_ANALYSIS_DAILY_LIMIT - (used_today + queued)),
        over_limit=over,
    )


@router.get("/company-analyses", response_model=list[CompanyAnalysisOut])
@limiter.limit("120/minute")
async def list_company_analyses(
    request: Request,
    preset_id: int = Query(...),
    company_ids: list[int] = Query(..., min_length=1, max_length=200),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Возвращает текущие результаты AI-анализа для (preset, companies).
    UI поллит этот endpoint каждые ~3 сек, пока есть pending."""
    preset = (await db.execute(
        select(UserFilterPreset).where(
            UserFilterPreset.id == preset_id,
            UserFilterPreset.user_id == user_id,
        )
    )).scalar_one_or_none()
    if preset is None or not (preset.ai_prompt or "").strip():
        return []
    prompt_hash_value = svc.prompt_hash(preset.ai_prompt)
    existing = await svc.get_existing(
        db, user_id=user_id, company_ids=company_ids,
        prompt_hash_value=prompt_hash_value,
    )
    return [
        CompanyAnalysisOut(
            company_id=cid, score=r.score, comment=r.comment,
            status=r.status, error=r.error,
        )
        for cid, r in existing.items()
    ]
