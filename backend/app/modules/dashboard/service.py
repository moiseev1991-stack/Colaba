"""
Dashboard service - aggregated data from searches (SEO runs).
"""

from collections import defaultdict
from datetime import datetime, timedelta
from typing import List, Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.search import Search
from app.modules.dashboard import schemas


# Map DB status to unified categories
def _map_status(s: str) -> str:
    s = (s or "").lower()
    if s in ("completed", "done"):
        return "completed"
    if s in ("failed", "error"):
        return "failed"
    if s in ("processing", "running", "in_progress"):
        return "running"
    if s in ("pending", "queued"):
        return "queued"
    return "pending"


def _is_active(status: str) -> bool:
    return _map_status(status) in ("running", "queued")


def _is_completed(status: str) -> bool:
    return _map_status(status) == "completed"


async def get_dashboard_data(
    db: AsyncSession,
    user_id: int,
    organization_id: Optional[int],
    period: str,
    date_from: Optional[datetime],
    date_to: Optional[datetime],
    module: str = "all",
) -> schemas.DashboardResponse:
    """
    Build dashboard payload. Currently only SEO (searches) module.
    period: day | week | month | custom
    """
    now = datetime.utcnow()
    if period == "day":
        from_ts = now - timedelta(days=1)
        to_ts = now
    elif period == "week":
        from_ts = now - timedelta(days=7)
        to_ts = now
    elif period == "month":
        from_ts = now - timedelta(days=30)
        to_ts = now
    elif period == "custom" and date_from and date_to:
        from_ts = date_from
        to_ts = date_to
    else:
        from_ts = now - timedelta(days=7)
        to_ts = now

    # Base query: searches for user org
    q = select(Search).where(Search.created_at >= from_ts, Search.created_at <= to_ts)
    if organization_id is not None:
        q = q.where(Search.organization_id == organization_id)

    result = await db.execute(q.order_by(Search.created_at.desc()))
    rows = result.scalars().all()

    # Filter by module: currently only SEO
    if module != "all" and module != "seo":
        rows = []  # leads/tenders not implemented

    # KPI
    completed = [r for r in rows if _is_completed(r.status)]
    failed = [r for r in rows if _map_status(r.status) == "failed"]
    active_list = [r for r in rows if _is_active(r.status)]

    total_runs = len(rows)
    success_runs = len(completed)
    error_runs = len(failed)
    results_total = sum(r.result_count or 0 for r in rows)

    # avg_time: from started_at / finished_at if available
    timed = [
        r for r in completed
        if getattr(r, "started_at", None) and getattr(r, "finished_at", None)
    ]
    if timed:
        total_sec = sum(
            (r.finished_at - r.started_at).total_seconds() for r in timed
        )
        avg_time_sec: Optional[float] = round(total_sec / len(timed), 1)
    else:
        avg_time_sec = None
    # cost: no tarification
    cost_rub = 0.0
    has_cost = False

    kpi = schemas.DashboardKpi(
        total=total_runs,
        success=success_runs,
        errors=error_runs,
        avg_time_sec=avg_time_sec,
        cost_rub=cost_rub,
        results=results_total,
        has_cost_tarification=has_cost,
    )

    # runs_by_day
    by_day: dict[str, dict] = defaultdict(lambda: {"total": 0, "success": 0, "errors": 0, "running": 0})
    days_back = max(1, (to_ts - from_ts).days)
    for i in range(days_back + 1):
        d = (to_ts - timedelta(days=days_back - i)).date().isoformat()
        by_day[d]

    for r in rows:
        d = r.created_at.date().isoformat()
        by_day[d]["total"] += 1
        st = _map_status(r.status)
        if st == "completed":
            by_day[d]["success"] += 1
        elif st == "failed":
            by_day[d]["errors"] += 1
        elif st in ("running", "queued"):
            by_day[d]["running"] += 1

    runs_by_day = [
        schemas.RunsByDayItem(
            date=d,
            total=v["total"],
            success=v["success"],
            errors=v["errors"],
            running=v["running"],
        )
        for d, v in sorted(by_day.items())
    ]

    # active_runs: last 24h runs with running/queued
    active_q = select(Search).where(
        Search.status.in_(["pending", "processing", "running", "queued"]),
        Search.created_at >= now - timedelta(hours=24),
    )
    if organization_id is not None:
        active_q = active_q.where(Search.organization_id == organization_id)
    active_result = await db.execute(active_q.order_by(Search.created_at.desc()).limit(5))
    active_rows = active_result.scalars().all()

    active_runs = [
        schemas.ActiveRunItem(
            id=str(r.id),
            module="seo",
            query=r.query,
            status=_map_status(r.status),
            started_at=r.created_at.isoformat() if r.created_at else "",
            progress={"found": r.result_count or 0, "total": r.num_results or 0} if r.result_count else None,
            duration_sec=int((now - r.created_at).total_seconds()) if r.created_at else None,
        )
        for r in active_rows
    ]

    # recent_runs: last 10
    recent = rows[:10]
    recent_runs = [
        schemas.RecentRunItem(
            id=str(r.id),
            module="seo",
            query=r.query,
            status=_map_status(r.status),
            created_at=r.created_at.isoformat() if r.created_at else "",
            results=r.result_count or 0,
            cost_rub=None,
        )
        for r in recent
    ]

    return schemas.DashboardResponse(
        kpi=kpi,
        runs_by_day=runs_by_day,
        active_runs=active_runs,
        recent_runs=recent_runs,
    )
