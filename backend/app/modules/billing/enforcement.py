"""Обёртка списания кредитов для роутеров/задач.

CREDITS_ENABLED=False (бета бесплатна) — списания не производятся.
402-ответ несёт человеку-понятную причину: сколько нужно/доступно/не хватает.
"""

import logging
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.billing.service import InsufficientCreditsError, spend_credits

logger = logging.getLogger(__name__)


async def charge_or_402(
    db: AsyncSession,
    user_id: int,
    operation: str,
    amount: Optional[int] = None,
    ref_type: Optional[str] = None,
    ref_id: Optional[int] = None,
) -> Optional[int]:
    """Списать кредиты за операцию или отдать 402 с расшифровкой.

    Возвращает баланс после списания (None, когда тарификация выключена).
    Коммит остаётся на вызывающем (общая транзакция с бизнес-операцией).
    """
    if not settings.CREDITS_ENABLED:
        return None
    try:
        return await spend_credits(db, user_id, operation, amount, ref_type, ref_id)
    except InsufficientCreditsError as e:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "insufficient_credits",
                "message": str(e),
                "required": e.required,
                "balance": e.balance,
                "missing": e.missing,
                "operation": e.operation,
                "topup_url": "/app/billing",
            },
        ) from e


async def refund_quietly(
    db: AsyncSession,
    user_id: int,
    operation: str,
    amount: int,
    ref_type: Optional[str] = None,
    ref_id: Optional[int] = None,
) -> None:
    """Возврат кредитов при провале операции после списания (в celery-задачах)."""
    if not settings.CREDITS_ENABLED or amount <= 0:
        return
    try:
        from app.modules.billing.service import refund_credits

        await refund_credits(db, user_id, operation, amount, ref_type, ref_id)
        await db.commit()
        logger.info("Credits refunded: user=%s op=%s amount=%s ref=%s", user_id, operation, amount, ref_id)
    except Exception:
        logger.exception("Refund failed: user=%s op=%s", user_id, operation)
