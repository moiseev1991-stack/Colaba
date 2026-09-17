import asyncio

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.billing import Payment
from app.modules.billing.service import activate_subscription


async def main():
    async with AsyncSessionLocal() as db:
        user_id = 194  # ux.billing@test-spinlid.ru
        exists = (
            await db.execute(select(Payment).where(Payment.provider_payment_id == "emu-prod-001"))
        ).scalar_one_or_none()
        if exists:
            print(f"already: payment #{exists.id}")
            return
        pay = Payment(
            user_id=user_id,
            provider="yookassa",
            provider_payment_id="emu-prod-001",
            tariff_code="starter",
            amount_rub=990,
            credits=500,
            status="succeeded",
            granted=True,
        )
        db.add(pay)
        await db.flush()
        sub = await activate_subscription(db, user_id, "starter", payment_id=pay.id)
        await db.commit()
        print(f"OK: subscription #{sub.id} until {sub.period_end}, payment #{pay.id}")


asyncio.run(main())
