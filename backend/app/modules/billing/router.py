"""Billing API — ЛК тарификации: баланс, тарифы, история, подписка."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.router import get_current_user_id
from app.modules.billing import service as credits
from app.modules.billing.tariffs import (
    OPERATION_LABELS,
    OPERATIONS_PRICES,
    tariffs_payload,
)
from app.models.billing import Subscription
from app.core.config import settings

router = APIRouter(prefix="/billing", tags=["billing"])
logger = logging.getLogger(__name__)


class SubscriptionAction(BaseModel):
    """Включить/выключить автопродление."""

    auto_renew: Optional[bool] = None
    cancel_at_period_end: Optional[bool] = None


@router.get("/summary")
async def billing_summary(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Всё для ЛК биллинга одним запросом: баланс, подписка, тарифы, цены."""
    balance = await credits.get_balance(db, user_id)
    sub = await credits.get_active_subscription(db, user_id)
    return {
        "balance": balance,
        # Пока бета бесплатна — списания не включены, показываем честно
        "enforcement_enabled": settings.CREDITS_ENABLED,
        "subscription": (
            {
                "tariff_code": sub.tariff_code,
                "status": sub.status,
                "period_start": sub.period_start.isoformat(),
                "period_end": sub.period_end.isoformat(),
                "auto_renew": sub.auto_renew,
                "cancel_at_period_end": sub.cancel_at_period_end,
            }
            if sub
            else None
        ),
        "tariffs": tariffs_payload(),
        "operations_prices": [
            {"code": code, "label": OPERATION_LABELS[code], "credits": price}
            for code, price in OPERATIONS_PRICES.items()
        ],
        "payments_configured": bool(settings.YOOKASSA_SHOP_ID and settings.YOOKASSA_SECRET_KEY),
    }


@router.get("/transactions")
async def billing_transactions(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """История начислений/списаний с пагинацией."""
    offset = (page - 1) * page_size
    items, total = await credits.list_transactions(db, user_id, limit=page_size, offset=offset)
    return {
        "items": [
            {
                "id": t.id,
                "type": t.type,
                "amount": t.amount,
                "balance_after": t.balance_after,
                "operation": t.operation,
                "comment": t.comment,
                "created_at": t.created_at.isoformat(),
            }
            for t in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/subscription")
async def update_subscription(
    payload: SubscriptionAction,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Управление подпиской: автопродление вкл/выкл (правило z.ai: действует
    до конца оплаченного периода, смена тарифа — через новую оплату)."""
    sub = await credits.get_active_subscription(db, user_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Активной подписки нет")

    if payload.auto_renew is not None:
        sub.auto_renew = payload.auto_renew
    if payload.cancel_at_period_end is not None:
        sub.cancel_at_period_end = payload.cancel_at_period_end
        if payload.cancel_at_period_end:
            sub.auto_renew = False
        else:
            sub.auto_renew = True
    await db.commit()
    return {
        "tariff_code": sub.tariff_code,
        "auto_renew": sub.auto_renew,
        "cancel_at_period_end": sub.cancel_at_period_end,
        "period_end": sub.period_end.isoformat(),
    }
