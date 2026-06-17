"""Юнит-тесты схем и pure-функций bulk-генерации КП (миграция 036).

Без БД — проверяем только pydantic-валидацию KpBulkGenerateRequest и
helper'ы kp_bulk_service.mark_running / mark_finished.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models.kp_generation_job import KpGenerationJob
from app.modules.outreach import kp_bulk_service
from app.modules.outreach.kp_schemas import KpBulkGenerateRequest


def test_bulk_request_accepts_minimal():
    req = KpBulkGenerateRequest(
        company_ids=[1, 2, 3],
        template_key="webstudio",
    )
    assert req.tone == "neutral"
    assert req.custom_sender_profile is None


def test_bulk_request_rejects_empty_company_ids():
    with pytest.raises(ValidationError):
        KpBulkGenerateRequest(company_ids=[], template_key="webstudio")


def test_bulk_request_rejects_too_many_company_ids():
    with pytest.raises(ValidationError):
        KpBulkGenerateRequest(
            company_ids=list(range(1, 502)),
            template_key="webstudio",
        )


def test_bulk_request_rejects_empty_template_key():
    with pytest.raises(ValidationError):
        KpBulkGenerateRequest(company_ids=[1], template_key="")


def test_bulk_request_rejects_invalid_tone():
    with pytest.raises(ValidationError):
        KpBulkGenerateRequest(
            company_ids=[1],
            template_key="webstudio",
            tone="aggressive",  # type: ignore[arg-type]
        )


def test_bulk_request_accepts_bold_tone():
    req = KpBulkGenerateRequest(
        company_ids=[1],
        template_key="custom",
        tone="bold",
        custom_sender_profile="фрилансер по таргету",
    )
    assert req.tone == "bold"
    assert req.custom_sender_profile == "фрилансер по таргету"


def test_mark_running_sets_status_and_started_at():
    job = KpGenerationJob(
        user_id=1,
        status="queued",
        template_key="webstudio",
        tone="neutral",
        company_ids=[1],
        total=1,
    )
    kp_bulk_service.mark_running(job)
    assert job.status == "running"
    assert job.started_at is not None


def test_mark_finished_done_path():
    job = KpGenerationJob(
        user_id=1,
        status="running",
        template_key="webstudio",
        tone="neutral",
        company_ids=[1],
        total=1,
    )
    kp_bulk_service.mark_finished(job)
    assert job.status == "done"
    assert job.finished_at is not None
    assert job.error_message is None


def test_mark_finished_cancelled_path():
    job = KpGenerationJob(
        user_id=1,
        status="running",
        template_key="webstudio",
        tone="neutral",
        company_ids=[1, 2],
        total=2,
    )
    kp_bulk_service.mark_finished(job, cancelled=True)
    assert job.status == "cancelled"
    assert job.finished_at is not None


def test_mark_finished_error_overrides_cancelled():
    job = KpGenerationJob(
        user_id=1,
        status="running",
        template_key="webstudio",
        tone="neutral",
        company_ids=[1],
        total=1,
    )
    kp_bulk_service.mark_finished(
        job, cancelled=True, error_message="LLM провал"
    )
    # error_message приоритетнее — это failed.
    assert job.status == "failed"
    assert job.error_message == "LLM провал"
