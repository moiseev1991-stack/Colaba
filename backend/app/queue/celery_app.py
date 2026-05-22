"""
Celery application configuration.
"""

from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

# Create Celery app
celery_app = Celery(
    "leadgen_constructor",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.queue.tasks",
        "app.modules.maps.tasks",
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
    },
)
