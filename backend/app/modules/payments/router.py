"""Payments API router — YooKassa integration."""

import logging
from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.core.config import settings
from app.modules.auth.router import get_current_user_id
from app.modules.payments import schemas, service

router = APIRouter(prefix="/payments", tags=["payments"])
logger = logging.getLogger(__name__)


@router.get("/plans")
async def list_plans():
    """Return available tariff plans."""
    return {
        "plans": [
            {"id": k, **v}
            for k, v in schemas.PLANS.items()
        ],
        "configured": service._configured(),
    }


@router.post("/create", response_model=schemas.PaymentResponse)
async def create_payment(
    payload: schemas.CreatePaymentRequest,
    user_id: int = Depends(get_current_user_id),
):
    """Create a new YooKassa payment and return the redirect URL."""
    plan_info = schemas.PLANS.get(payload.plan)
    if not plan_info:
        raise HTTPException(status_code=400, detail="Неизвестный тарифный план")

    amount = plan_info["price_rub"]
    description = f"Подписка {plan_info['name']} — {plan_info['description']}"
    return_url = (
        payload.return_url
        or settings.YOOKASSA_RETURN_URL
        or "https://example.com/payment/success"
    )

    try:
        result = await service.create_payment(
            amount_rub=amount,
            plan=payload.plan,
            description=description,
            return_url=return_url,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"YooKassa error: {exc}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Ошибка платёжного шлюза: {exc}")

    confirmation = result.get("confirmation", {})
    return schemas.PaymentResponse(
        payment_id=result["id"],
        status=result.get("status", "pending"),
        confirmation_url=confirmation.get("confirmation_url", ""),
        amount_rub=amount,
        plan=payload.plan,
    )


@router.get("/{payment_id}/status", response_model=schemas.PaymentStatusResponse)
async def get_payment_status(
    payment_id: str,
    user_id: int = Depends(get_current_user_id),
):
    """Get YooKassa payment status."""
    try:
        result = await service.get_payment(payment_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Ошибка платёжного шлюза: {exc}")

    amount_val = result.get("amount", {}).get("value", "0")
    try:
        amount_rub = int(float(amount_val))
    except ValueError:
        amount_rub = 0

    return schemas.PaymentStatusResponse(
        payment_id=payment_id,
        status=result.get("status", "unknown"),
        paid=result.get("paid", False),
        amount_rub=amount_rub,
        plan=result.get("metadata", {}).get("plan", ""),
    )


@router.post("/webhook")
async def yookassa_webhook(request: Request):
    """YooKassa webhook endpoint — receives payment notifications."""
    body = await request.json()
    event = body.get("event", "")
    payment = body.get("object", {})

    logger.info(f"YooKassa webhook: event={event}, payment_id={payment.get('id')}, status={payment.get('status')}")

    if event == "payment.succeeded":
        plan = payment.get("metadata", {}).get("plan", "")
        payment_id = payment.get("id")
        amount = payment.get("amount", {}).get("value")
        logger.info(f"Payment succeeded: id={payment_id}, plan={plan}, amount={amount}")

    return {"ok": True}
