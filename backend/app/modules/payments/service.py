"""YooKassa payment service."""

import uuid
import logging
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

YOOKASSA_API = "https://api.yookassa.ru/v3"


def _configured() -> bool:
    return bool(settings.YOOKASSA_SHOP_ID and settings.YOOKASSA_SECRET_KEY)


def _auth() -> tuple[str, str]:
    return (settings.YOOKASSA_SHOP_ID, settings.YOOKASSA_SECRET_KEY)


async def create_payment(
    amount_rub: int,
    plan: str,
    description: str,
    return_url: str,
    user_id: Optional[int] = None,
    idempotency_key: Optional[str] = None,
) -> dict:
    """Create a YooKassa payment and return the JSON response.

    user_id уходит в metadata (лимит ЮKassa — короткие строки): по нему
    webhook находит платёж в нашей БД (payments.user_id) и начисляет
    кредиты правильному юзеру.
    """
    if not _configured():
        raise RuntimeError("ЮКасса не настроена. Обратитесь в поддержку.")

    key = idempotency_key or str(uuid.uuid4())
    payload = {
        "amount": {"value": f"{amount_rub}.00", "currency": "RUB"},
        "confirmation": {"type": "redirect", "return_url": return_url},
        "capture": True,
        "description": description,
        "metadata": {"plan": plan, "uid": str(user_id) if user_id else ""},
    }

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            f"{YOOKASSA_API}/payments",
            json=payload,
            auth=_auth(),
            headers={"Idempotence-Key": key},
        )
        resp.raise_for_status()
        return resp.json()


async def get_payment(payment_id: str) -> dict:
    """Get YooKassa payment status."""
    if not _configured():
        raise RuntimeError("ЮКасса не настроена.")
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{YOOKASSA_API}/payments/{payment_id}",
            auth=_auth(),
        )
        resp.raise_for_status()
        return resp.json()
