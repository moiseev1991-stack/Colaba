"""
Dashboard API router.
"""

from datetime import datetime, time
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.core.dependencies import get_db, get_current_user_id, get_current_organization_id
from app.modules.dashboard import schemas, service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=schemas.DashboardResponse)
async def get_dashboard(
    period: str = Query("week", description="day | week | month | custom"),
    date_from: Optional[str] = Query(None, description="ISO date for custom range"),
    date_to: Optional[str] = Query(None, description="ISO date for custom range"),
    module: str = Query("all", description="all | seo | leads | tenders"),
    user_id: int = Depends(get_current_user_id),
    organization_id: Optional[int] = Depends(get_current_organization_id),
    db=Depends(get_db),
):
    """Get aggregated dashboard data for the current period and module."""
    df = datetime.combine(datetime.strptime(date_from[:10], "%Y-%m-%d").date(), time.min) if date_from else None
    dt = datetime.combine(datetime.strptime(date_to[:10], "%Y-%m-%d").date(), time.max) if date_to else None
    return await service.get_dashboard_data(
        db=db,
        user_id=user_id,
        organization_id=organization_id,
        period=period,
        date_from=df,
        date_to=dt,
        module=module,
    )
