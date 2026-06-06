"""
Celery application configuration.
"""

import logging

from celery import Celery
from celery.schedules import crontab
from app.core.config import settings


logger = logging.getLogger(__name__)


# Sentry init для Celery worker'ов. Без отдельного init здесь FastAPI app
# (где sentry_sdk.init вызван в main.py) не запускается в воркере → исключения
# в Celery-тасках уходят только в local log, без алерта.
if settings.SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.celery import CeleryIntegration
    from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        profiles_sample_rate=settings.SENTRY_PROFILES_SAMPLE_RATE,
        send_default_pii=False,
        integrations=[CeleryIntegration(), SqlalchemyIntegration()],
    )
    logger.info("Sentry enabled in Celery worker: env=%s", settings.ENVIRONMENT)

# Create Celery app
celery_app = Celery(
    "leadgen_constructor",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.queue.tasks",
        "app.modules.maps.tasks",
        "app.modules.reviews_ai.tasks",
    ],
)

# Celery configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=30 * 60,  # 30 minutes
    task_soft_time_limit=25 * 60,  # 25 minutes
    # Prefetch: сколько задач забирать заранее (ускоряет обработку очереди)
    worker_prefetch_multiplier=4,
    # Periodic tasks
    beat_schedule={
        'process-email-replies-every-5-minutes': {
            'task': 'process_email_replies_task',
            'schedule': 300.0,  # Every 5 minutes
        },
        # maps cron: чистка raw_text отзывов старше 30 дней
        'purge-review-raw-text-daily': {
            'task': 'purge_review_raw_text',
            'schedule': crontab(hour=3, minute=30),
        },
        # reviews_ai cron: переcclusterизация top-30 ниш
        'recluster-popular-niches-daily': {
            'task': 'recluster_popular_niches',
            'schedule': crontab(hour=4, minute=0),
        },
        # multi-source dedup (Phase 3 ТЗ 2026-06-03): ищем пары
        # (2gis-row, yandex_maps-row) одной компании по phone/coords/name
        # и склеиваем под один company_id. Раз в час — баланс между
        # «новые компании склеены быстро» и нагрузкой на БД.
        'dedup-multisource-hourly': {
            'task': 'dedup_multisource_phase2',
            'schedule': crontab(minute=15),  # каждый час в :15
        },
    },
)
