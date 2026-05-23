"""Тесты регистрации Celery-задач reviews_ai."""

from app.modules.reviews_ai.tasks import (
    analyze_reviews_batch,
    analyze_reviews_for_company,
    recluster_pains_for_niche_task,
    recluster_popular_niches,
)


def test_celery_ai_tasks_registered_with_correct_queues():
    assert analyze_reviews_for_company.name == "analyze_reviews_for_company"
    assert analyze_reviews_for_company.queue == "maps_ai"

    assert analyze_reviews_batch.name == "analyze_reviews_batch"
    assert analyze_reviews_batch.queue == "maps_ai"

    assert recluster_pains_for_niche_task.name == "recluster_pains_for_niche_task"
    assert recluster_pains_for_niche_task.queue == "maps_ai"

    assert recluster_popular_niches.name == "recluster_popular_niches"
    assert recluster_popular_niches.queue == "maps_ai"


def test_recluster_popular_niches_scheduled_daily():
    from app.queue.celery_app import celery_app
    sched = celery_app.conf.beat_schedule
    assert "recluster-popular-niches-daily" in sched
    assert sched["recluster-popular-niches-daily"]["task"] == "recluster_popular_niches"
