"""One-off добивка хвостов кампаний прогрева 49 и 50 (15.09.2026).

Причина хвостов: SoftTimeLimitExceeded на старом коде — зашитый интервал 90с
× 100+ КП = 2.5ч превышал time-limit 2ч, кампании умирали на ~76-м письме.
После PR #235 (интервал 30с, лимит 4ч) этот скрипт доправляет недостающие
письма в СУЩЕСТВУЮЩИЕ кампании — не создаёт новые и не раздувает дневную
квоту прогрева сверх необходимого.

Запуск (внутри контейнера celery-worker):
    python /tmp/backfill_warmup_campaigns.py
Лог: /tmp/backfill_warmup.log
"""

import asyncio
import logging
import sys
from datetime import datetime
from email.utils import make_msgid

sys.path.insert(0, "/app")

from sqlalchemy import func, select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.email import EmailCampaign, EmailLog, EmailStatus
from app.models.email_provider_config import EmailProviderConfig
from app.modules.email.service import EmailServiceError, email_service
from app.modules.outreach.kp_service import generate_kp
from app.modules.outreach.warmup_service import (
    USER_ID,
    _find_or_create_thread,
    _update_thread_outgoing,
    first_email,
    get_candidate_companies,
    pick_legend,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("backfill")

INTERVAL = float(getattr(settings, "WARMUP_SEND_INTERVAL", 0) or 30)

# (campaign_id, целевое число писем). Идемпотентно: недостающее считается из БД,
# поэтому скрипт можно перезапускать после рестарта контейнера — продолжит с места.
TARGETS = [(49, 100), (50, 110)]


async def backfill_campaign(camp_id: int, target_total: int) -> int:
    gen_sem = asyncio.Semaphore(3)

    async with AsyncSessionLocal() as db:
        camp = (await db.execute(select(EmailCampaign).where(EmailCampaign.id == camp_id))).scalar_one()
        if camp.status == "completed":
            logger.info("Кампания %s уже completed — пропуск", camp_id)
            return 0
        sent_before = (
            await db.execute(
                select(func.count())
                .select_from(EmailLog)
                .where(
                    EmailLog.campaign_id == camp_id,
                    EmailLog.status == EmailStatus.SENT.value,
                )
            )
        ).scalar_one()
        need = target_total - sent_before
        if need <= 0:
            camp.sent_count = sent_before
            camp.failed_count = max(camp.total_recipients - sent_before, 0)
            camp.status = "completed"
            camp.completed_at = datetime.utcnow()
            db.add(camp)
            await db.commit()
            logger.info("Кампания %s уже полная (%d) — закрыта", camp_id, sent_before)
            return 0
        logger.info("Кампания %s: отправлено %d/%d, добивка +%d", camp_id, sent_before, target_total, need)

        candidates = await get_candidate_companies(db, need)

    # План: ~30% timeweb / 70% postbox — как в основном прогреве.
    tw_n = max(int(need * 0.3), 1)
    plan = []
    for comp in candidates:
        email = first_email(comp)
        if not email:
            continue
        legend_key, brand = pick_legend()
        plan.append(
            {
                "company_id": comp.company_id,
                "to_email": email,
                "provider": "timeweb" if len(plan) < tw_n else "postbox",
                "legend": legend_key,
                "brand": brand,
            }
        )
        if len(plan) >= need:
            break

    logger.info("Кампания %s: план добивки=%d (нужно %d)", camp_id, len(plan), need)
    if not plan:
        logger.error("Кампания %s: нет кандидатов, пропуск", camp_id)
        return 0

    async def _gen(p):
        async with gen_sem:
            try:
                async with AsyncSessionLocal() as gen_db:
                    return await generate_kp(
                        gen_db,
                        user_id=USER_ID,
                        company_id=p["company_id"],
                        template_key=p["legend"],
                        tone="neutral",
                    )
            except Exception as e:
                logger.warning("KP gen failed company %s: %s", p["company_id"], str(e)[:80])
                return None

    gen_results = await asyncio.gather(*[_gen(p) for p in plan])
    logger.info(
        "Кампания %s: сгенерировано %d/%d КП",
        camp_id,
        sum(1 for r in gen_results if r),
        len(plan),
    )

    sent_new = 0
    async with AsyncSessionLocal() as db:
        camp = (await db.execute(select(EmailCampaign).where(EmailCampaign.id == camp_id))).scalar_one()
        pb = (
            await db.execute(select(EmailProviderConfig).where(EmailProviderConfig.provider_id == "postbox"))
        ).scalar_one()
        tw = (
            await db.execute(select(EmailProviderConfig).where(EmailProviderConfig.provider_id == "timeweb"))
        ).scalar_one()

        for i, p in enumerate(plan):
            result = gen_results[i]
            if result is None:
                continue
            draft = result.draft_row
            from_email = tw.from_email if p["provider"] == "timeweb" else pb.from_email

            thread_id = await _find_or_create_thread(
                db,
                user_id=USER_ID,
                contact_email=p["to_email"],
                contact_name=None,
                subject=draft.subject,
            )
            message_id = make_msgid(idstring=f"kp-{p['company_id']}", domain="spinlid.ru")

            log = EmailLog(
                campaign_id=camp.id,
                user_id=USER_ID,
                organization_id=None,
                to_email=p["to_email"],
                subject=draft.subject,
                status=EmailStatus.PENDING.value,
                thread_id=thread_id,
                external_message_id=message_id,
            )
            db.add(log)
            await db.flush()

            try:
                await email_service.send_email(
                    to_email=p["to_email"],
                    subject=draft.subject,
                    body=draft.body,
                    from_email=from_email,
                    from_name=p["brand"],
                    reply_to="dmitry@spinlid-team.ru",
                    db=db,
                    force_provider=p["provider"],
                )
                log.status = EmailStatus.SENT.value
                log.sent_at = datetime.utcnow()
                log.body_preview = draft.body
                sent_new += 1
                await _update_thread_outgoing(db, thread_id, draft.body)
            except EmailServiceError as e:
                log.status = EmailStatus.FAILED.value
                log.error_message = str(e)[:500]
                log.error_code = "SEND_FAILED"
                logger.warning("send failed %s: %s", p["to_email"], str(e)[:80])
            db.add(log)
            await db.commit()

            if i < len(plan) - 1:
                await asyncio.sleep(INTERVAL)

        sent_total = (
            await db.execute(
                select(func.count())
                .select_from(EmailLog)
                .where(
                    EmailLog.campaign_id == camp.id,
                    EmailLog.status == EmailStatus.SENT.value,
                )
            )
        ).scalar_one()
        camp.sent_count = sent_total
        camp.failed_count = max(camp.total_recipients - sent_total, 0)
        camp.status = "completed"
        camp.completed_at = datetime.utcnow()
        db.add(camp)
        await db.commit()
        logger.info(
            "Кампания %s ЗАВЕРШЕНА: отправлено %d/%d (добивка +%d)",
            camp_id,
            sent_total,
            camp.total_recipients,
            sent_new,
        )
    return sent_new


async def main():
    logger.info("Старт добивки: %s, интервал %.0fс", TARGETS, INTERVAL)
    for camp_id, target_total in TARGETS:
        try:
            await backfill_campaign(camp_id, target_total)
        except Exception:
            logger.exception("Кампания %s: падение добивки", camp_id)
    logger.info("Добивка завершена.")


asyncio.run(main())
