"""
API router for email replies.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.core.database import get_db
from app.modules.auth.router import get_current_user_id
from app.models.email_reply import EmailReply

# Явные пути под /email (без GET "" на prefix=/email/replies — иначе 404 за прокси/слешами).
router = APIRouter(prefix="/email", tags=["Email Replies"])


class EmailReplyResponse(BaseModel):
    """Schema for email reply response."""
    id: int
    from_email: str
    from_name: Optional[str]
    subject: str
    body_text: Optional[str]
    campaign_id: Optional[int]
    is_processed: bool
    forwarded_to: Optional[str]
    received_at: str

    class Config:
        from_attributes = True


@router.get("/replies", response_model=dict)
async def get_email_replies(
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """
    Get email replies for the current user.
    """
    # Get replies for this user
    result = await db.execute(
        select(EmailReply)
        .where(EmailReply.user_id == user_id)
        .order_by(desc(EmailReply.received_at))
        .limit(limit)
        .offset(offset)
    )
    replies = result.scalars().all()

    # Get total count
    count_result = await db.execute(
        select(EmailReply)
        .where(EmailReply.user_id == user_id)
    )
    total = len(count_result.scalars().all())

    return {
        "replies": [
            EmailReplyResponse(
                id=r.id,
                from_email=r.from_email,
                from_name=r.from_name,
                subject=r.subject,
                body_text=r.body_text,
                campaign_id=r.campaign_id,
                is_processed=r.is_processed,
                forwarded_to=r.forwarded_to,
                received_at=r.received_at.isoformat() if r.received_at else None,
            )
            for r in replies
        ],
        "total": total,
    }


@router.get("/replies/{reply_id}", response_model=EmailReplyResponse)
async def get_email_reply(
    reply_id: int,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """
    Get a specific email reply by ID.
    """
    result = await db.execute(
        select(EmailReply)
        .where(EmailReply.id == reply_id, EmailReply.user_id == user_id)
    )
    reply = result.scalar_one_or_none()

    if not reply:
        raise HTTPException(status_code=404, detail="Reply not found")

    return EmailReplyResponse(
        id=reply.id,
        from_email=reply.from_email,
        from_name=reply.from_name,
        subject=reply.subject,
        body_text=reply.body_text,
        campaign_id=reply.campaign_id,
        is_processed=reply.is_processed,
        forwarded_to=reply.forwarded_to,
        received_at=reply.received_at.isoformat() if reply.received_at else None,
    )
