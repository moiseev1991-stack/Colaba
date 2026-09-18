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
    status: str = Query(
        default="",
        pattern="^(|active|blocked|superuser|subscriber|zero_balance)$",
        description="Фильтр: активные/заблокированные/админы/с подпиской/без кредитов",
    ),
    sort: str = Query(default="created_desc", pattern="^(created_desc|created_asc|email_asc|id_desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Пользователи с биллинг-статусом: баланс, подписка + фильтры и пагинация.

    Практики enterprise-таблиц (Pencil&Paper/NN/g): пагинация, фильтры по
    состоянию, предсказуемый порядок. Балансы/подписки читаются пачкой
    для страницы (2 запроса), а не N+1.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    conds = []
    if q:
        conds.append(User.email.ilike(f"%{q}%"))
    if status == "active":
        conds.append(User.is_active.is_(True))
    elif status == "blocked":
        conds.append(User.is_active.is_(False))
    elif status == "superuser":
        conds.append(User.is_superuser.is_(True))
    elif status in ("subscriber", "zero_balance"):
        # фильтр по наличию активной подписки / остатку кредитов — через
        # подзапросы, чтобы не тащить все строки в python
        sub_exists = (
            select(Subscription.id)
            .where(
                Subscription.user_id == User.id,
                Subscription.status == "active",
                Subscription.period_end > now,
            )
            .exists()
        )
        bucket_sum = (
            select(func.coalesce(func.sum(CreditBucket.amount_granted - CreditBucket.amount_spent), 0))
            .where(
                CreditBucket.user_id == User.id,
                CreditBucket.amount_granted > CreditBucket.amount_spent,
                or_(CreditBucket.expires_at.is_(None), CreditBucket.expires_at > now),
            )
            .scalar_subquery()
        )
        if status == "subscriber":
            conds.append(sub_exists)
        else:
            conds.append(bucket_sum == 0)

    from sqlalchemy import and_

    cond = and_(*conds) if conds else True

    order = {
        "created_desc": User.id.desc(),
        "created_asc": User.id.asc(),
        "email_asc": User.email.asc(),
        "id_desc": User.id.desc(),
    }[sort]

    total = (await db.execute(select(func.count()).select_from(User).where(cond))).scalar_one()

    rows = (
        (await db.execute(select(User).where(cond).order_by(order).limit(page_size).offset((page - 1) * page_size)))
        .scalars()
        .all()
    )

    ids = [u.id for u in rows]
    buckets_by_user: dict[int, int] = {i: 0 for i in ids}
    subs_by_user: dict[int, Subscription] = {}
    if ids:
        for b in (
            (
                await db.execute(
                    select(CreditBucket).where(
                        CreditBucket.user_id.in_(ids),
                        CreditBucket.amount_granted > CreditBucket.amount_spent,
                    )
                )
            )
            .scalars()
            .all()
        ):
            if b.expires_at is None or b.expires_at.replace(tzinfo=None) > now:
                buckets_by_user[b.user_id] = buckets_by_user.get(b.user_id, 0) + (b.amount_granted - b.amount_spent)
        for s in (
            (
                await db.execute(
                    select(Subscription)
                    .where(
                        Subscription.user_id.in_(ids),
                        Subscription.status == "active",
                        Subscription.period_end > now,
                    )
                    .order_by(Subscription.period_end.desc())
                )
            )
            .scalars()
            .all()
        ):
            subs_by_user.setdefault(s.user_id, s)

    items = [
        {
            "id": u.id,
            "email": u.email,
            "is_active": bool(u.is_active),
            "is_superuser": bool(u.is_superuser),
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "balance": buckets_by_user.get(u.id, 0),
            "subscription": (
                {
                    "tariff_code": subs_by_user[u.id].tariff_code,
                    "period_end": subs_by_user[u.id].period_end.isoformat(),
                    "auto_renew": subs_by_user[u.id].auto_renew,
                }
                if u.id in subs_by_user
                else None
            ),
        }
        for u in rows
    ]

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, -(-total // page_size)),
    }


class AdminGrantRequest(BaseModel):
    amount: int = Field(gt=0, le=1_000_000, description="Кредиты к начислению")
    comment: str = Field(min_length=3, max_length=300)


@router.post("/users/{user_id}/grant")
async def admin_grant_credits(
    user_id: int,
    payload: AdminGrantRequest,
    admin=Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Начислить кредиты вручную (не сгорают). Аудит: comment в ledger + лог."""
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    admin_email = admin.email
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
    admin=Depends(require_superuser),
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

    admin_email = admin.email

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


@router.get("/users/{user_id}/detail")
async def admin_user_detail(user_id: int, db: AsyncSession = Depends(get_db)):
    """Карточка юзера для админа (master-detail): профиль, активность,
    гранты кредитов, подписка, последние транзакции."""
    from app.models.maps import MapSearch

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    searches_stat = (
        await db.execute(select(func.count(), func.max(MapSearch.created_at)).where(MapSearch.user_id == user_id))
    ).one()

    buckets = (
        (
            await db.execute(
                select(CreditBucket)
                .where(
                    CreditBucket.user_id == user_id,
                    CreditBucket.amount_granted > CreditBucket.amount_spent,
                )
                .order_by(CreditBucket.expires_at.asc().nullslast())
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
                Subscription.user_id == user_id,
                Subscription.status == "active",
                Subscription.period_end > now,
            )
            .order_by(Subscription.period_end.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    txs, tx_total = await credits.list_transactions(db, user_id, limit=10)

    return {
        "id": user.id,
        "email": user.email,
        "is_active": bool(user.is_active),
        "is_superuser": bool(user.is_superuser),
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "stats": {
            "searches_count": searches_stat[0] or 0,
            "last_search_at": searches_stat[1].isoformat() if searches_stat[1] else None,
        },
        "balance": balance,
        "buckets": [
            {
                "source": b.source,
                "remaining": b.amount_granted - b.amount_spent,
                "expires_at": b.expires_at.isoformat() if b.expires_at else None,
            }
            for b in buckets
            if b.expires_at is None or b.expires_at.replace(tzinfo=None) > now
        ],
        "subscription": (
            {
                "tariff_code": sub.tariff_code,
                "period_end": sub.period_end.isoformat(),
                "auto_renew": sub.auto_renew,
            }
            if sub
            else None
        ),
        "transactions": [
            {
                "id": t.id,
                "type": t.type,
                "amount": t.amount,
                "operation": t.operation,
                "comment": t.comment,
                "created_at": t.created_at.isoformat(),
            }
            for t in txs
        ],
        "transactions_total": tx_total,
    }


class AdminUserStatusRequest(BaseModel):
    is_active: bool


@router.post("/users/{user_id}/status")
async def admin_user_status(
    user_id: int,
    payload: AdminUserStatusRequest,
    admin=Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Блокировка/разблокировка (практика: нельзя заблокировать себя;
    красная кнопка + подтверждение на фронте). Блокировка закрывает вход,
    существующие JWT живут до экспирации — ограничение MVP."""
    if user_id == admin.id and not payload.is_active:
        raise HTTPException(status_code=400, detail="Нельзя заблокировать самого себя")

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    user.is_active = payload.is_active
    await db.commit()
    logger.info("ADMIN USER STATUS: admin=%s user=%s is_active=%s", admin.email, user_id, payload.is_active)
    return {"user_id": user_id, "is_active": payload.is_active}


class AdminUserRoleRequest(BaseModel):
    is_superuser: bool


@router.post("/users/{user_id}/role")
async def admin_user_role(
    user_id: int,
    payload: AdminUserRoleRequest,
    admin=Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Выдача/снятие прав суперадмина (нельзя снять себе — защита от лок-аута)."""
    if user_id == admin.id and not payload.is_superuser:
        raise HTTPException(status_code=400, detail="Нельзя снять права админа у самого себя")

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    user.is_superuser = payload.is_superuser
    await db.commit()
    logger.info("ADMIN USER ROLE: admin=%s user=%s is_superuser=%s", admin.email, user_id, payload.is_superuser)
    return {"user_id": user_id, "is_superuser": payload.is_superuser}


@router.get("/users/export")
async def admin_users_export(
    q: str = "",
    db: AsyncSession = Depends(get_db),
):
    """CSV всех (или найденных фильтром) юзеров — для таблиц/поддержки."""
    from fastapi.responses import PlainTextResponse

    cond = User.email.ilike(f"%{q}%") if q else True
    rows = (await db.execute(select(User).where(cond).order_by(User.id))).scalars().all()
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    ids = [u.id for u in rows]
    bal: dict[int, int] = {i: 0 for i in ids}
    if ids:
        for b in (
            (
                await db.execute(
                    select(CreditBucket).where(
                        CreditBucket.user_id.in_(ids),
                        CreditBucket.amount_granted > CreditBucket.amount_spent,
                    )
                )
            )
            .scalars()
            .all()
        ):
            if b.expires_at is None or b.expires_at.replace(tzinfo=None) > now:
                bal[b.user_id] = bal.get(b.user_id, 0) + (b.amount_granted - b.amount_spent)

    lines = ["id;email;created;active;superuser;balance"]
    for u in rows:
        lines.append(
            f"{u.id};{u.email};{(u.created_at.strftime('%Y-%m-%d') if u.created_at else '')};"
            f"{'yes' if u.is_active else 'no'};{'yes' if u.is_superuser else 'no'};{bal.get(u.id, 0)}"
        )
    csv = "\n".join(lines)
    return PlainTextResponse(
        csv,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=users.csv"},
    )
