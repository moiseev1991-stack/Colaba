"""
Monitor module router.

Чтение api_call_log для дашборда «Live API Requests Table» и агрегатов
стоимости. Раньше (до миграции 044) здесь был mock с захардкоженным
списком запросов; теперь отдаёт реальные вызовы внешних API из таблицы.

Совместимость со старым фронтом: в /requests сохранены поля
{id, method, url, response_time_ms, ok, phone} (phone всегда null —
это был mock-артефакт), добавлены новые {provider, cost_rub, model,
prompt_tokens, completion_tokens, user_id, map_search_id, created_at}.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.models.api_call_log import ApiCallLog

router = APIRouter(prefix="/monitor", tags=["monitor"])


def _row_to_dict(r: ApiCallLog) -> dict:
    """Маппит строку ApiCallLog в формат ответа API (с совместимостью со старым фронтом)."""
    return {
        # Совместимость со старым форматом:
        "id": str(r.id),
        "method": r.method or "",
        "url": r.endpoint,
        "response_time_ms": r.latency_ms or 0,
        "phone": None,  # было mock-полем; оставлено для совместимости
        "ok": bool(r.ok),
        # Новые поля:
        "provider": r.provider,
        "cost_rub": float(r.cost_rub) if r.cost_rub is not None else 0.0,
        "model": r.model,
        "prompt_tokens": r.prompt_tokens,
        "completion_tokens": r.completion_tokens,
        "user_id": r.user_id,
        "map_search_id": r.map_search_id,
        "company_id": r.company_id,
        "http_status": r.http_status,
        "error": r.error,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("/requests")
async def get_monitor_requests(
    limit: int = Query(default=50, ge=1, le=500),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Последние N внешних API-вызовов (новые сверху).

    Требует авторизации. user_id текущего юзера не фильтрует (видно все —
    для админ-дашборда). Если нужно per-user — добавим query-параметр.
    """
    rows = (
        await db.execute(
            select(ApiCallLog)
            .order_by(ApiCallLog.created_at.desc(), ApiCallLog.id.desc())
            .limit(limit)
        )
    ).scalars().all()
    return {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "requests": [_row_to_dict(r) for r in rows],
    }


@router.get("/summary")
async def get_monitor_summary(
    period: str = Query(default="day", regex="^(day|week|month|all)$"),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Сводка по стоимости и количеству вызовов за период + breakdown по провайдерам.

    Возвращает:
    - total_cost_rub, total_calls, ok_calls, failed_calls
    - by_provider: [{provider, calls, cost_rub, ok_pct}]
    - tokens: {prompt_total, completion_total} (для LLM)
    """
    now = datetime.now(timezone.utc)
    if period == "day":
        since = now - timedelta(days=1)
    elif period == "week":
        since = now - timedelta(days=7)
    elif period == "month":
        since = now - timedelta(days=30)
    else:
        since = None

    base = select(ApiCallLog)
    if since is not None:
        base = base.where(ApiCallLog.created_at >= since)

    # Общие агрегаты.
    totals_row = (
        await db.execute(
            base.with_only_columns(
                func.coalesce(func.sum(ApiCallLog.cost_rub), 0).label("total_cost"),
                func.count(ApiCallLog.id).label("total_calls"),
                func.count(ApiCallLog.id).filter(ApiCallLog.ok.is_(True)).label("ok_calls"),
                func.count(ApiCallLog.id).filter(ApiCallLog.ok.is_(False)).label("failed_calls"),
                func.coalesce(func.sum(ApiCallLog.prompt_tokens), 0).label("prompt_total"),
                func.coalesce(func.sum(ApiCallLog.completion_tokens), 0).label("completion_total"),
            )
        )
    ).one()

    # Breakdown по провайдеру.
    provider_stmt = (
        select(
            ApiCallLog.provider,
            func.count(ApiCallLog.id).label("calls"),
            func.coalesce(func.sum(ApiCallLog.cost_rub), 0).label("cost_rub"),
            func.count(ApiCallLog.id).filter(ApiCallLog.ok.is_(True)).label("ok_calls"),
        )
        .group_by(ApiCallLog.provider)
        .order_by(func.sum(ApiCallLog.cost_rub).desc())
    )
    if since is not None:
        provider_stmt = provider_stmt.where(ApiCallLog.created_at >= since)
    provider_rows = (await db.execute(provider_stmt)).all()

    def _f(v) -> float:
        return float(v) if isinstance(v, Decimal) else (v or 0)

    return {
        "period": period,
        "since": since.isoformat() if since else None,
        "until": now.isoformat(),
        "total_cost_rub": _f(totals_row.total_cost),
        "total_calls": totals_row.total_calls or 0,
        "ok_calls": totals_row.ok_calls or 0,
        "failed_calls": totals_row.failed_calls or 0,
        "tokens": {
            "prompt_total": int(totals_row.prompt_total or 0),
            "completion_total": int(totals_row.completion_total or 0),
        },
        "by_provider": [
            {
                "provider": row.provider,
                "calls": row.calls,
                "cost_rub": _f(row.cost_rub),
                "ok_pct": round((row.ok_calls or 0) / row.calls * 100, 1) if row.calls else 0.0,
            }
            for row in provider_rows
        ],
    }


@router.get("/by-search/{map_search_id}")
async def get_monitor_by_search(
    map_search_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Стоимость конкретного поиска лидов: ответ на «сколько стоил этот запрос».

    Возвращает totals (cost/calls/ok/failed/tokens) + breakdown по провайдерам
    + (опционально) последние N записей.
    """
    base = select(ApiCallLog).where(ApiCallLog.map_search_id == map_search_id)

    totals_row = (
        await db.execute(
            base.with_only_columns(
                func.coalesce(func.sum(ApiCallLog.cost_rub), 0).label("total_cost"),
                func.count(ApiCallLog.id).label("total_calls"),
                func.count(ApiCallLog.id).filter(ApiCallLog.ok.is_(True)).label("ok_calls"),
                func.count(ApiCallLog.id).filter(ApiCallLog.ok.is_(False)).label("failed_calls"),
                func.coalesce(func.sum(ApiCallLog.prompt_tokens), 0).label("prompt_total"),
                func.coalesce(func.sum(ApiCallLog.completion_tokens), 0).label("completion_total"),
            )
        )
    ).one()

    provider_rows = (
        await db.execute(
            select(
                ApiCallLog.provider,
                func.count(ApiCallLog.id).label("calls"),
                func.coalesce(func.sum(ApiCallLog.cost_rub), 0).label("cost_rub"),
            )
            .where(ApiCallLog.map_search_id == map_search_id)
            .group_by(ApiCallLog.provider)
            .order_by(func.sum(ApiCallLog.cost_rub).desc())
        )
    ).all()

    def _f(v) -> float:
        return float(v) if isinstance(v, Decimal) else (v or 0)

    return {
        "map_search_id": map_search_id,
        "total_cost_rub": _f(totals_row.total_cost),
        "total_calls": totals_row.total_calls or 0,
        "ok_calls": totals_row.ok_calls or 0,
        "failed_calls": totals_row.failed_calls or 0,
        "tokens": {
            "prompt_total": int(totals_row.prompt_total or 0),
            "completion_total": int(totals_row.completion_total or 0),
        },
        "by_provider": [
            {
                "provider": row.provider,
                "calls": row.calls,
                "cost_rub": _f(row.cost_rub),
            }
            for row in provider_rows
        ],
    }
