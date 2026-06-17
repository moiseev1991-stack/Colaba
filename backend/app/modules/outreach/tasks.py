"""Celery-задачи модуля outreach.

Сейчас тут только bulk-генерация КП (generate_kp_bulk_task). Очередь
maps_ai — туда же ходят reviews_ai.tasks, потому что и там, и тут LLM
(один пул ассистентов outreach_draft) и неважно, чья задача займёт
worker'а первой.
"""

from __future__ import annotations

import asyncio
import logging

from app.core.database import AsyncSessionLocal
from app.models.kp_generation_job import KpGenerationJob
from app.modules.outreach import kp_bulk_service, kp_service
from app.queue.celery_app import celery_app

logger = logging.getLogger(__name__)


# Пауза между КП. ProxyAPI у Димы платный и rate-limited; небольшая
# yield-пауза снижает 429 и даёт worker'у не залипать на одном job'е,
# когда параллельно крутится reviews_ai recluster.
_PER_COMPANY_SLEEP_SEC = 0.2


async def _refresh_cancel_flag(db, job: KpGenerationJob) -> bool:
    """Перечитывает job.cancel_requested из БД. Возвращает True если
    задача попросила отмену.
    """
    await db.refresh(job, ["cancel_requested"])
    return bool(job.cancel_requested)


async def _generate_kp_bulk_async(job_id: int) -> dict:
    async with AsyncSessionLocal() as db:
        job = await db.get(KpGenerationJob, job_id)
        if job is None:
            logger.warning("generate_kp_bulk_task: job #%d not found", job_id)
            return {"status": "not_found"}

        if job.status not in ("queued", "running"):
            logger.info(
                "generate_kp_bulk_task: job #%d already in terminal status %s, skip",
                job_id,
                job.status,
            )
            return {"status": job.status, "skipped": True}

        kp_bulk_service.mark_running(job)
        await db.commit()

        company_ids: list[int] = list(job.company_ids or [])
        if not company_ids:
            kp_bulk_service.mark_finished(job, error_message="Пустой список компаний.")
            await db.commit()
            return {"status": "failed", "reason": "empty_company_ids"}

        cancelled = False
        for company_id in company_ids:
            if await _refresh_cancel_flag(db, job):
                cancelled = True
                break

            try:
                await kp_service.generate_kp(
                    db,
                    user_id=job.user_id,
                    company_id=int(company_id),
                    template_key=job.template_key,
                    tone=job.tone or "neutral",
                    custom_sender_profile=job.custom_sender_profile,
                )
                job.generated += 1
            except kp_service.KpGenerationError as e:
                # Per-company сбой — не валит весь job. Логируем и идём
                # дальше; финальный счётчик «не получилось N» юзер увидит
                # в модалке.
                logger.info(
                    "generate_kp_bulk_task job=%d company=%d skipped: %s",
                    job_id,
                    company_id,
                    e.message,
                )
                job.failed += 1
            except Exception as e:
                logger.exception(
                    "generate_kp_bulk_task job=%d company=%d unexpected error: %s",
                    job_id,
                    company_id,
                    e,
                )
                job.failed += 1

            job.last_company_id = int(company_id)
            await db.commit()
            await asyncio.sleep(_PER_COMPANY_SLEEP_SEC)

        kp_bulk_service.mark_finished(job, cancelled=cancelled)
        await db.commit()
        return {
            "status": job.status,
            "generated": job.generated,
            "failed": job.failed,
            "total": job.total,
        }


@celery_app.task(name="generate_kp_bulk_task", queue="maps_ai", bind=True, max_retries=0)
def generate_kp_bulk_task(self, job_id: int):
    """Bulk-обёртка над outreach.kp_service.generate_kp.

    max_retries=0 — повторно гонять весь job нельзя: часть КП уже
    сгенерирована и записана в kp_drafts, ретрай породит дубли. При
    неожиданной ошибке внутри loop ловим и считаем как failed по компании,
    job в целом завершается с тем, что успело пройти.
    """
    try:
        return asyncio.run(_generate_kp_bulk_async(job_id))
    except Exception as exc:
        logger.error(
            "generate_kp_bulk_task job=%d crashed before iteration: %s",
            job_id,
            exc,
            exc_info=True,
        )
        # Помечаем job как failed, чтобы UI не висел в «running» вечно.
        async def _mark_failed():
            async with AsyncSessionLocal() as db:
                job = await db.get(KpGenerationJob, job_id)
                if job is not None and job.status in ("queued", "running"):
                    kp_bulk_service.mark_finished(job, error_message=str(exc)[:1000])
                    await db.commit()

        try:
            asyncio.run(_mark_failed())
        except Exception:
            logger.exception("generate_kp_bulk_task: failed to write failed-status")
        raise
