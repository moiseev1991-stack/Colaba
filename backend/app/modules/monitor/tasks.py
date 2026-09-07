"""Celery-задачи модуля monitor (очередь maintenance)."""

from __future__ import annotations

import asyncio
import logging

from app.core.database import AsyncSessionLocal
from app.queue.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="check_integrations_alert", queue="maintenance")
def check_integrations_alert():
    """Раз в 30 мин (beat): ok% внешних API за час → TG-алерт владельцу.

    Урок аудита 2026-09-07: месяц молча умирали интеграции (OpenAI 402,
    DaData 403, 2GIS 0%) при зелёном CI/CD. Логика в alerts.py.
    """

    async def _run():
        import redis as redis_lib

        from app.core.config import settings
        from app.modules.monitor.alerts import run_integration_alerts

        r = None
        try:
            redis_url = settings.REDIS_URL or "redis://localhost:6379/0"
            r = redis_lib.from_url(redis_url, decode_responses=False)
            r.ping()
        except Exception as e:  # noqa: BLE001
            logger.warning("integration-alert: redis недоступен (%s) — без анти-спам кулдауна", e)
            r = None

        async with AsyncSessionLocal() as db:
            return await run_integration_alerts(db, redis_client=r)

    try:
        result = asyncio.run(_run())
        if result.get("status") == "alert":
            logger.warning("integration-alert triggered: %s", result)
        return result
    except Exception as e:  # noqa: BLE001
        logger.exception("check_integrations_alert failed: %s", e)
        return {"status": "error", "error": str(e)[:200]}
