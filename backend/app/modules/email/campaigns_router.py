"""Email campaigns API router."""

import logging
from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.modules.auth.router import get_current_user_id
from app.models.email import (
    EmailCampaign,
    EmailLog,
    EmailStatus,
    CampaignStatus,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/email", tags=["email"])


# Response schemas
class CampaignResponse(BaseModel):
    """Email campaign response."""
    id: int
    name: str
    subject: str
    status: str
    total_recipients: int
    sent_count: int
    delivered_count: int
    opened_count: int
    clicked_count: int
    bounced_count: int
    spam_count: int
    failed_count: int
    from_email: Optional[str]
    from_name: Optional[str]
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


class EmailLogResponse(BaseModel):
    """Email log response."""
    id: int
    campaign_id: Optional[int]
    to_email: str
    to_name: Optional[str]
    subject: str
    status: str
    external_message_id: Optional[str]
    error_message: Optional[str]
    created_at: datetime
    sent_at: Optional[datetime]
    delivered_at: Optional[datetime]
    opened_at: Optional[datetime]
    clicked_at: Optional[datetime]
    bounced_at: Optional[datetime]

    class Config:
        from_attributes = True


class CampaignStatsResponse(BaseModel):
    """Campaign statistics response."""
    total: int
    sent: int
    delivered: int
    opened: int
    clicked: int
    bounced: int
    spam: int
    failed: int
    delivery_rate: float
    open_rate: float
    click_rate: float
    bounce_rate: float


def _campaign_to_response(campaign: EmailCampaign) -> CampaignResponse:
    """Convert campaign model to response."""
    return CampaignResponse(
        id=campaign.id,
        name=campaign.name,
        subject=campaign.subject,
        status=campaign.status.value,
        total_recipients=campaign.total_recipients,
        sent_count=campaign.sent_count,
        delivered_count=campaign.delivered_count,
        opened_count=campaign.opened_count,
        clicked_count=campaign.clicked_count,
        bounced_count=campaign.bounced_count,
        spam_count=campaign.spam_count,
        failed_count=campaign.failed_count,
        from_email=campaign.from_email,
        from_name=campaign.from_name,
        created_at=campaign.created_at,
        started_at=campaign.started_at,
        completed_at=campaign.completed_at,
    )


def _log_to_response(log: EmailLog) -> EmailLogResponse:
    """Convert log model to response."""
    return EmailLogResponse(
        id=log.id,
        campaign_id=log.campaign_id,
        to_email=log.to_email,
        to_name=log.to_name,
        subject=log.subject,
        status=log.status.value,
        external_message_id=log.external_message_id,
        error_message=log.error_message,
        created_at=log.created_at,
        sent_at=log.sent_at,
        delivered_at=log.delivered_at,
        opened_at=log.opened_at,
        clicked_at=log.clicked_at,
        bounced_at=log.bounced_at,
    )


@router.get("/campaigns", response_model=List[CampaignResponse])
async def list_campaigns(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status: Optional[str] = Query(default=None),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List email campaigns for the current user."""
    query = select(EmailCampaign).where(EmailCampaign.user_id == user_id)
    
    if status:
        try:
            status_enum = CampaignStatus(status)
            query = query.where(EmailCampaign.status == status_enum)
        except ValueError:
            pass
    
    query = query.order_by(EmailCampaign.created_at.desc())
    query = query.offset(offset).limit(limit)
    
    result = await db.execute(query)
    campaigns = result.scalars().all()
    
    return [_campaign_to_response(c) for c in campaigns]


@router.get("/campaigns/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(
    campaign_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get a single email campaign."""
    result = await db.execute(
        select(EmailCampaign).where(
            and_(
                EmailCampaign.id == campaign_id,
                EmailCampaign.user_id == user_id,
            )
        )
    )
    campaign = result.scalar_one_or_none()
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    return _campaign_to_response(campaign)


@router.get("/campaigns/{campaign_id}/stats", response_model=CampaignStatsResponse)
async def get_campaign_stats(
    campaign_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get campaign statistics."""
    # First verify campaign exists and belongs to user
    result = await db.execute(
        select(EmailCampaign).where(
            and_(
                EmailCampaign.id == campaign_id,
                EmailCampaign.user_id == user_id,
            )
        )
    )
    campaign = result.scalar_one_or_none()
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Count logs by status
    stats_result = await db.execute(
        select(
            EmailLog.status,
            func.count(EmailLog.id).label("count"),
        )
        .where(EmailLog.campaign_id == campaign_id)
        .group_by(EmailLog.status)
    )
    
    stats = {row.status: row.count for row in stats_result}
    
    sent = stats.get(EmailStatus.SENT, 0)
    delivered = stats.get(EmailStatus.DELIVERED, 0)
    opened = stats.get(EmailStatus.OPENED, 0) + stats.get(EmailStatus.CLICKED, 0)
    clicked = stats.get(EmailStatus.CLICKED, 0)
    bounced = stats.get(EmailStatus.BOUNCED, 0)
    spam = stats.get(EmailStatus.SPAM, 0)
    failed = stats.get(EmailStatus.FAILED, 0)
    total = sum(stats.values())
    
    return CampaignStatsResponse(
        total=total,
        sent=sent,
        delivered=delivered,
        opened=opened,
        clicked=clicked,
        bounced=bounced,
        spam=spam,
        failed=failed,
        delivery_rate=round((delivered / sent * 100), 1) if sent > 0 else 0,
        open_rate=round((opened / delivered * 100), 1) if delivered > 0 else 0,
        click_rate=round((clicked / delivered * 100), 1) if delivered > 0 else 0,
        bounce_rate=round((bounced / sent * 100), 1) if sent > 0 else 0,
    )


@router.get("/campaigns/{campaign_id}/logs", response_model=List[EmailLogResponse])
async def get_campaign_logs(
    campaign_id: int,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    status: Optional[str] = Query(default=None),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get logs for a campaign."""
    # First verify campaign exists and belongs to user
    result = await db.execute(
        select(EmailCampaign).where(
            and_(
                EmailCampaign.id == campaign_id,
                EmailCampaign.user_id == user_id,
            )
        )
    )
    campaign = result.scalar_one_or_none()
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    query = select(EmailLog).where(EmailLog.campaign_id == campaign_id)
    
    if status:
        try:
            status_enum = EmailStatus(status)
            query = query.where(EmailLog.status == status_enum)
        except ValueError:
            pass
    
    query = query.order_by(EmailLog.created_at.desc())
    query = query.offset(offset).limit(limit)
    
    result = await db.execute(query)
    logs = result.scalars().all()
    
    return [_log_to_response(log) for log in logs]


@router.get("/stats", response_model=CampaignStatsResponse)
async def get_email_stats(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get overall email statistics for the current user."""
    # Count logs by status for user's campaigns
    stats_result = await db.execute(
        select(
            EmailLog.status,
            func.count(EmailLog.id).label("count"),
        )
        .where(EmailLog.user_id == user_id)
        .group_by(EmailLog.status)
    )
    
    stats = {row.status: row.count for row in stats_result}
    
    sent = stats.get(EmailStatus.SENT, 0)
    delivered = stats.get(EmailStatus.DELIVERED, 0)
    opened = stats.get(EmailStatus.OPENED, 0) + stats.get(EmailStatus.CLICKED, 0)
    clicked = stats.get(EmailStatus.CLICKED, 0)
    bounced = stats.get(EmailStatus.BOUNCED, 0)
    spam = stats.get(EmailStatus.SPAM, 0)
    failed = stats.get(EmailStatus.FAILED, 0)
    total = sum(stats.values())
    
    return CampaignStatsResponse(
        total=total,
        sent=sent,
        delivered=delivered,
        opened=opened,
        clicked=clicked,
        bounced=bounced,
        spam=spam,
        failed=failed,
        delivery_rate=round((delivered / sent * 100), 1) if sent > 0 else 0,
        open_rate=round((opened / delivered * 100), 1) if delivered > 0 else 0,
        click_rate=round((clicked / delivered * 100), 1) if delivered > 0 else 0,
        bounce_rate=round((bounced / sent * 100), 1) if sent > 0 else 0,
    )
