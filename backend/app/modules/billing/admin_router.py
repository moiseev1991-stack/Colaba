"""Admin API биллинга (суперюзер): обзор, пользователи, гранты, подписки, платежи.

Практики (Stripe/EnterpriseReady, 2026-09): минимальный жизнеспособный админ =
поиск юзера + биллинг-статус + действия (грант/подписка) + аудит каждого
действия. Аудит — ledger с комментарием «admin:» + логи; отдельная таблица
на MVP не нужна. Импersonation — сознательно вне MVP (токен-механика).
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import require_superuser
from app.models.billing import CreditBucket, CreditTransaction, Payment, Subscription
from app.models.user import User
from app.modules.billing import service as credits
from app.modules.billing.tariffs import TARIFFS, get_tariff

router = APIRouter(prefix="/billing/admin", tags=["billing-admin"], dependencies=[Depends(require_superuser)])
logger = logging.getLogger(__name__)


@router.get("/overview")
async def admin_overview(db: AsyncSession = Depends(get_db)):
    """Сводка: юзеры, активные подписки, кредиты в обороте, платежи."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    users_total = (await db.execute(select(func.count()).select_from(User))).scalar_one()

    subs = (
        await db.execute(
            select(Subscription.tariff_code, func.count())
            .where(Subscription.status == "active", Subscription.period_end > now)
            .group_by(Subscription.tariff_code)
        )
    ).all()

    # Кредиты в обороте: остатки неистёкших бакетов
    in_circulation = (
        await db.execute(
            select(func.coalesce(func.sum(CreditBucket.amount_granted - CreditBucket.amount_spent), 0)).where(
                CreditBucket.amount_granted > CreditBucket.amount_spent,
                or_(CreditBucket.expires_at.is_(None), CreditBucket.expires_at > now),
            )
        )
    ).scalar_one()

    granted_total = (await db.execute(select(func.coalesce(func.sum(CreditBucket.amount_granted), 0)))).scalar_one()
    spent_total = (await db.execute(select(func.coalesce(func.sum(CreditBucket.amount_spent), 0)))).scalar_one()

    payments = (
        await db.execute(
            select(
                func.count(),
                func.coalesce(func.sum(Payment.amount_rub), 0),
            ).where(Payment.status == "succeeded")
        )
    ).one()

    active_subs_count = sum(n for _, n in subs)
    mrr = sum(TARIFFS[code].price_rub * n for code, n in subs if code in TARIFFS)

    return {
        "users_total": users_total,
        "active_subscriptions": active_subs_count,
        "subscriptions_by_tariff": {code: n for code, n in subs},
        "mrr_rub": mrr,
        "credits_in_circulation": int(in_circulation),
        "credits_granted_total": int(granted_total),
        "credits_spent_total": int(spent_total),
        "payments_succeeded": payments[0],
        "payments_rub_total": int(payments[1]),
    }


@router.get("/users")
async def admin_users(
    q: str = Query(default="", description="Поиск по email"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Пользователи с биллинг-статусом: баланс, подписка, платежи."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    cond = User.email.ilike(f"%{q}%") if q else True

    total = (await db.execute(select(func.count()).select_from(User).where(cond))).scalar_one()

    rows = (
        (
            await db.execute(
                select(User).where(cond).order_by(User.id.desc()).limit(page_size).offset((page - 1) * page_size)
            )
        )
        .scalars()
        .all()
    )

    items = []
    for u in rows:
        balance = 0
        buckets = (
            (
                await db.execute(
                    select(CreditBucket).where(
                        CreditBucket.user_id == u.id,
                        CreditBucket.amount_granted > CreditBucket.amount_spent,
                    )
                )
            )
            .scalars()
            .all()
        )
        balance = sum(
            b.amount_granted - b.amount_spent
            for b in buckets
            if b.expires_at is None or b.expires_at.replace(tzinfo=None) > now
        )
        sub = (
            await db.execute(
                select(Subscription)
                .where(
                    Subscription.user_id == u.id,
                    Subscription.status == "active",
                    Subscription.period_end > now,
                )
                .order_by(Subscription.period_end.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        items.append(
            {
                "id": u.id,
                "email": u.email,
                "is_superuser": bool(u.is_superuser),
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "balance": balance,
                "subscription": (
                    {
                        "tariff_code": sub.tariff_code,
                        "period_end": sub.period_end.isoformat(),
                        "auto_renew": sub.auto_renew,
                    }
                    if sub
                    else None
                ),
            }
        )

    return {"items": items, "total": total, "page": page, "page_size": page_size}


class AdminGrantRequest(BaseModel):
    amount: int = Field(gt=0, le=1_000_000, description="Кредиты к начислению")
    comment: str = Field(min_length=3, max_length=300)


@router.post("/users/{user_id}/grant")
async def admin_grant_credits(
    user_id: int,
    payload: AdminGrantRequest,
    admin_id: int = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Начислить кредиты вручную (не сгорают). Аудит: comment в ledger + лог."""
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    admin_email = (
        await db.execute(select(User.email).where(User.id == admin_id))
    ).scalar_one_or_none() or f"admin:{admin_id}"
    comment = f"admin:{admin_email}: {payload.comment}"

    balance = await credits.grant_credits(db, user_id, payload.amount, "admin", comment=comment)
    await db.commit()
    logger.info(
        "ADMIN GRANT: admin=%s user=%s amount=%s comment=%s", admin_email, user_id, payload.amount, payload.comment
    )
    return {"user_id": user_id, "granted": payload.amount, "balance": balance}


class AdminSubscriptionRequest(BaseModel):
    action: str = Field(pattern="^(activate|cancel)$")
    tariff_code: Optional[str] = None


@router.post("/users/{user_id}/subscription")
async def admin_subscription(
    user_id: int,
    payload: AdminSubscriptionRequest,
    admin_id: int = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Ручное управление подпиской.

    activate: выдаёт подписку на 30 дней + пакет кредитов (без оплаты —
      например, компенсация или партнёрский доступ).
    cancel: мягкая отмена — статус cancelled, автопродление снято;
      остаток подписочных кредитов остаётся до конца периода (квота).
    """
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    admin_email = (
        await db.execute(select(User.email).where(User.id == admin_id))
    ).scalar_one_or_none() or f"admin:{admin_id}"

    if payload.action == "activate":
        tariff = get_tariff(payload.tariff_code or "")
        if not tariff:
            raise HTTPException(status_code=400, detail="Укажите корректный tariff_code")
        sub = await credits.activate_subscription(db, user_id, tariff.code)
        sub.auto_renew = False  # админская выдача не автопродлевается
        await db.commit()
        logger.info("ADMIN SUB ACTIVATE: admin=%s user=%s tariff=%s", admin_email, user_id, tariff.code)
        return {
            "user_id": user_id,
            "action": "activate",
            "tariff_code": tariff.code,
            "period_end": sub.period_end.isoformat(),
        }

    # cancel
    res = await db.execute(
        update(Subscription)
        .where(Subscription.user_id == user_id, Subscription.status == "active")
        .values(status="cancelled", auto_renew=False, cancel_at_period_end=True)
    )
    await db.commit()
    logger.info("ADMIN SUB CANCEL: admin=%s user=%s rows=%s", admin_email, user_id, res.rowcount)
    return {"user_id": user_id, "action": "cancel", "updated": res.rowcount or 0}


@router.get("/users/{user_id}/transactions")
async def admin_user_transactions(
    user_id: int,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """Ledger конкретного юзера (аудит его начислений/списаний)."""
    items, total = await credits.list_transactions(db, user_id, limit=limit)
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
    }


@router.get("/payments")
async def admin_payments(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Все платежи (включая эмуляции) с юзером."""
    total = (await db.execute(select(func.count()).select_from(Payment))).scalar_one()
    rows = (
        await db.execute(
            select(Payment, User.email)
            .outerjoin(User, Payment.user_id == User.id)
            .order_by(Payment.id.desc())
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
    ).all()
    return {
        "items": [
            {
                "id": p.id,
                "user_id": p.user_id,
                "email": email,
                "provider_payment_id": p.provider_payment_id,
                "tariff_code": p.tariff_code,
                "amount_rub": p.amount_rub,
                "credits": p.credits,
                "status": p.status,
                "granted": p.granted,
                "created_at": p.created_at.isoformat(),
            }
            for p, email in rows
        ],
        "total": total,
        "page": page,
    }
