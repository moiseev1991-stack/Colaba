"""
Dashboard API schemas.
"""

from typing import List, Optional

from pydantic import BaseModel


class RunsByDayItem(BaseModel):
    """Aggregated runs per day."""
    date: str
    total: int
    success: int
    errors: int
    running: int


class ActiveRunItem(BaseModel):
    """Currently running/queued run."""
    id: str
    module: str
    query: str
    status: str
    started_at: str
    progress: Optional[dict] = None
    duration_sec: Optional[int] = None


class RecentRunItem(BaseModel):
    """Recent run for list."""
    id: str
    module: str
    query: str
    status: str
    created_at: str
    results: int
    cost_rub: Optional[float] = None


class DashboardKpi(BaseModel):
    """KPI block."""
    total: int
    success: int
    errors: int
    avg_time_sec: Optional[float] = None
    cost_rub: float
    results: int
    has_cost_tarification: bool = False


class DashboardResponse(BaseModel):
    """Full dashboard response."""
    kpi: DashboardKpi
    runs_by_day: List["RunsByDayItem"]
    active_runs: List[ActiveRunItem]
    recent_runs: List[RecentRunItem]
