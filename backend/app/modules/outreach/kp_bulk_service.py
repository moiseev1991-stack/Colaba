"""Bulk-сервис генерации КП по выделению (миграция 036).

Создание/чтение/отмена KpGenerationJob. Сам прогон выполняет Celery-task
`generate_kp_bulk_task` (app/modules/outreach/tasks.py); сервис не вызывает
LLM напрямую.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.kp_draft import KpDraft
from app.models.kp_generation_job import KpGenerationJob
from app.models.maps import Company
from app.models.organization import user_organizations

logger = logging.getLogger(__name__)


MAX_BULK_COMPANY_IDS = 500


class BulkJobError(Exception):
    """Ошибка bulk-сервиса с понятным сообщением и кодом ответа."""

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass
class JobView:
    """Снимок job + последние сгенерированные drafts для UI-прогресса."""

    job: KpGenerationJob
    recent_drafts: list[KpDraft]


async def _resolve_user_organization_id(db: AsyncSession, user_id: int) -> int | None:
    row = (
        await db.execute(
            select(user_organizations.c.organization_id)
            .where(user_organizations.c.user_id == user_id)
            .order_by(user_organizations.c.organization_id.asc())
            .limit(1)
        )
    ).first()
    if row is None:
        return None
    return int(row[0])


async def _filter_user_company_ids(
    db: AsyncSession, user_id: int, company_ids: Iterable[int]
) -> list[int]:
    """Оставляет только id существующих компаний. На MVP не проверяем
    «принадлежность юзеру» — Company пока шарится между юзерами (выдача
    map-search'а). Главное — отрезать невалидные id, чтобы task не упал
    с 404 на каждой итерации.
    """
    ids = [int(c) for c in company_ids if c is not None]
    if not ids:
        return []
    # Сохраняем порядок переданных id — это order обработки в task.
    rows = (
        await db.execute(select(Company.id).where(Company.id.in_(ids)))
    ).scalars().all()
    valid = {int(r) for r in rows}
    return [i for i in ids if i in valid]


async def create_bulk_job(
    db: AsyncSession,
    *,
    user_id: int,
    company_ids: list[int],
    template_key: str,
    tone: str = "neutral",
    custom_sender_profile: str | None = None,
) -> KpGenerationJob:
    """Создаёт job в статусе queued. Celery-task запускается отдельно
    (роутер делает `.delay(job.id)` после коммита).
    """
    if not company_ids:
        raise BulkJobError(
            "Выберите хотя бы одну компанию для генерации.", status_code=400
        )
    if len(company_ids) > MAX_BULK_COMPANY_IDS:
        raise BulkJobError(
            f"За один запуск можно сгенерировать не больше {MAX_BULK_COMPANY_IDS} КП.",
            status_code=400,
        )

    valid_ids = await _filter_user_company_ids(db, user_id, company_ids)
    if not valid_ids:
        raise BulkJobError(
            "Среди выбранных компаний не нашлось ни одной валидной.",
            status_code=400,
        )

    organization_id = await _resolve_user_organization_id(db, user_id)
    job = KpGenerationJob(
        user_id=user_id,
        organization_id=organization_id,
        status="queued",
        template_key=template_key,
        tone=tone,
        custom_sender_profile=custom_sender_profile,
        company_ids=valid_ids,
        total=len(valid_ids),
        generated=0,
        failed=0,
        cancel_requested=False,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


async def get_job_view(
    db: AsyncSession,
    *,
    user_id: int,
    job_id: int,
    drafts_limit: int = 5,
) -> JobView | None:
    """Job + последние N drafts, созданные этим юзером после job.started_at.
    Используется и для статус-эндпоинта, и для финального экрана модалки.
    """
    job = await db.get(KpGenerationJob, job_id)
    if job is None or job.user_id != user_id:
        return None

    # Drafts отбираем по started_at job'а: всё, что создано после старта
    # этим же юзером. Точное соответствие job ↔ draft через FK мы не
    # ведём (драфт пишется существующим generate_kp без знания о job-id);
    # для UI-прогресса этого хватает — параллельные одиночные генерации
    # этого же юзера тоже попадут в список, но они редки.
    since = job.started_at or job.created_at
    drafts = list(
        (
            await db.execute(
                select(KpDraft)
                .where(KpDraft.user_id == user_id, KpDraft.created_at >= since)
                .order_by(KpDraft.created_at.desc())
                .limit(drafts_limit)
            )
        ).scalars().all()
    )
    return JobView(job=job, recent_drafts=drafts)


async def request_cancel(
    db: AsyncSession,
    *,
    user_id: int,
    job_id: int,
) -> KpGenerationJob:
    """Ставит cancel_requested=true. Task проверит флаг между итерациями
    и выйдет со status='cancelled'. Если job уже в финальном статусе —
    возвращаем как есть (idempotent).
    """
    job = await db.get(KpGenerationJob, job_id)
    if job is None or job.user_id != user_id:
        raise BulkJobError("Задача не найдена.", status_code=404)
    if job.status in ("done", "cancelled", "failed"):
        return job
    job.cancel_requested = True
    await db.commit()
    await db.refresh(job)
    return job


@dataclass
class DraftListRow:
    """JOIN'енная строка KpDraft + Company.name/city для вкладки History."""

    draft: KpDraft
    company_name: str | None
    company_city: str | None


async def list_user_drafts(
    db: AsyncSession, *, user_id: int, limit: int = 50, offset: int = 0
) -> tuple[list[DraftListRow], int]:
    """Все КП юзера + имя/город компании. Используется для вкладки «КП»
    в History."""
    total = int(
        (
            await db.execute(
                select(sa_func.count(KpDraft.id)).where(KpDraft.user_id == user_id)
            )
        ).scalar_one()
        or 0
    )
    rows = (
        await db.execute(
            select(KpDraft, Company.name, Company.city)
            .outerjoin(Company, Company.id == KpDraft.company_id)
            .where(KpDraft.user_id == user_id)
            .order_by(KpDraft.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    items = [
        DraftListRow(draft=r[0], company_name=r[1], company_city=r[2]) for r in rows
    ]
    return items, total


async def list_user_jobs(
    db: AsyncSession, *, user_id: int, limit: int = 50
) -> list[KpGenerationJob]:
    rows = (
        await db.execute(
            select(KpGenerationJob)
            .where(KpGenerationJob.user_id == user_id)
            .order_by(KpGenerationJob.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    return list(rows)


def mark_running(job: KpGenerationJob) -> None:
    """Задача забрала job из очереди — переводит в running + ставит started_at."""
    job.status = "running"
    job.started_at = datetime.now(timezone.utc)


def mark_finished(
    job: KpGenerationJob,
    *,
    cancelled: bool = False,
    error_message: str | None = None,
) -> None:
    if error_message is not None:
        job.status = "failed"
        job.error_message = error_message
    elif cancelled:
        job.status = "cancelled"
    else:
        job.status = "done"
    job.finished_at = datetime.now(timezone.utc)
