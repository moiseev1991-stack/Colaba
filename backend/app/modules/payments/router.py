"""Payments API router — YooKassa + кредиты (тарификация 2026-09).

Отличия от первой версии:
- Платёж сохраняется в БД (payments) сразу при создании, с user_id —
  webhook знает, кому начислять.
- Webhook не доверяет телу: сверяет платёж через API ЮKassa и сумму
  с нашей записью; начисление идемпотентно (granted flag).
- Тарифы — из реестра billing.tariffs (кредиты), не из schemas.PLANS.
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.billing import Payment
from app.modules.auth.router import get_current_user_id
from app.modules.billing import service as credits_service
from app.modules.billing.tariffs import get_tariff, tariffs_payload
from app.modules.payments import schemas, service

router = APIRouter(prefix="/payments", tags=["payments"])
logger = logging.getLogger(__name__)


@router.get("/plans")
async def list_plans():
    """Тарифы с кредитами (реестр billing.tariffs — единый источник правды)."""
    return {
        "plans": tariffs_payload(),
        "configured": service._configured(),
    }


@router.post("/create", response_model=schemas.PaymentResponse)
async def create_payment(
    payload: schemas.CreatePaymentRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Создать платёж ЮKassa + записать его в БД с привязкой к юзеру."""
    tariff = get_tariff(payload.plan)
    if not tariff:
        raise HTTPException(status_code=400, detail="Неизвестный тарифный план")

    return_url = payload.return_url or settings.YOOKASSA_RETURN_URL or "https://www.spinlid.ru/payment/success"

    try:
        result = await service.create_payment(
            amount_rub=tariff.price_rub,
            plan=tariff.code,
            description=f"Подписка SpinLid «{tariff.name}»: {tariff.credits} кредитов на 30 дней",
            return_url=return_url,
            user_id=user_id,  # попадает в metadata → webhook знает кому начислять
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("YooKassa error: %s", exc, exc_info=True)
        raise HTTPException(status_code=502, detail="Ошибка платёжного шлюза. Попробуйте позже.")

    row = Payment(
        user_id=user_id,
        provider="yookassa",
        provider_payment_id=result["id"],
        tariff_code=tariff.code,
        amount_rub=tariff.price_rub,
        credits=tariff.credits,
        status="pending",
        raw=json.dumps(result, ensure_ascii=False),
    )
    db.add(row)
    await db.commit()

    confirmation = result.get("confirmation", {})
    return schemas.PaymentResponse(
        payment_id=result["id"],
        status=result.get("status", "pending"),
        confirmation_url=confirmation.get("confirmation_url", ""),
        amount_rub=tariff.price_rub,
        plan=tariff.code,
    )


async def _maybe_grant(db: AsyncSession, provider_payment_id: str):
    """Сверить платёж через API ЮKassa и начислить тариф (идемпотентно).

    Источник правды — API ЮKassa (webhook-тело может быть подделано).
    Начисляем только если: статус succeeded, сумма совпала, не был
    начислен ранее.
    """
    row = (
        await db.execute(select(Payment).where(Payment.provider_payment_id == provider_payment_id))
    ).scalar_one_or_none()
    if row is None:
        logger.warning("Grant: unknown provider_payment_id=%s", provider_payment_id)
        return None

    if row.granted:
        return row

    remote = await service.get_payment(provider_payment_id)
    remote_status = remote.get("status")
    amount_val = remote.get("amount", {}).get("value", "0")
    try:
        remote_amount = int(float(amount_val))
    except ValueError:
        remote_amount = -1

    if remote_status == "succeeded" and remote_amount >= row.amount_rub:
        # Транзакция: активация подписки + грант кредитов + метка granted
        await credits_service.activate_subscription(db, row.user_id, row.tariff_code, payment_id=row.id)
        row.status = "succeeded"
        row.granted = True
        row.raw = json.dumps(remote, ensure_ascii=False)
        await db.commit()
        logger.info(
            "Payment granted: id=%s user=%s tariff=%s credits=%s",
            row.id,
            row.user_id,
            row.tariff_code,
            row.credits,
        )
    elif remote_status in ("cancelled", "canceled"):
        row.status = "cancelled"
        await db.commit()

    return row


@router.get("/{payment_id}/status", response_model=schemas.PaymentStatusResponse)
async def get_payment_status(
    payment_id: str,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Статус платежа + верифицированное начисление (страховка от потерянного
    webhook: success-страница опрашивает этот эндпоинт)."""
    try:
        row = await _maybe_grant(db, payment_id)
    except Exception as exc:
        logger.error("Payment status/grant error: %s", exc, exc_info=True)
        raise HTTPException(status_code=502, detail="Ошибка платёжного шлюза")

    if row is None:
        raise HTTPException(status_code=404, detail="Платёж не найден")

    return schemas.PaymentStatusResponse(
        payment_id=payment_id,
        status=row.status,
        paid=row.status == "succeeded",
        amount_rub=row.amount_rub,
        plan=row.tariff_code,
    )


@router.post("/webhook")
async def yookassa_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Webhook ЮKassa. Тело НЕ доверяем — только берём id и сверяем через API."""
    try:
        body = await request.json()
    except Exception:
        return {"ok": False}

    event = body.get("event", "")
    provider_payment_id = body.get("object", {}).get("id")
    logger.info("YooKassa webhook: event=%s id=%s", event, provider_payment_id)

    if event in ("payment.succeeded", "payment.canceled") and provider_payment_id:
        if not service._configured():
            logger.warning("Webhook skipped: YooKassa not configured")
            return {"ok": True}
        try:
            await _maybe_grant(db, provider_payment_id)
        except Exception:
            logger.exception("Webhook grant failed: id=%s", provider_payment_id)
            # ЮKassa повторит webhook — отвечаем ok чтобы не ловить блокировку
            return {"ok": True}

    return {"ok": True}
