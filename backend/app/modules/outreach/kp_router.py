"""Роутер KP-конвейера (Эпик A фокус-релиза «КП-конвейер»).

Эндпоинты подмонтированы под /outreach/kp/* в `outreach.router`.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.router import get_current_user_id
from app.modules.outreach import kp_bulk_service, kp_service
from app.modules.outreach.kp_schemas import (
    KpArgumentsUsed,
    KpBulkDraftPreview,
    KpBulkGenerateRequest,
    KpBulkJobOut,
    KpDraftListItem,
    KpDraftListResponse,
    KpDraftOut,
    KpGenerateRequest,
    KpTemplateOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/kp", tags=["outreach-kp"])


@router.get("/templates", response_model=list[KpTemplateOut])
async def list_templates(
    _user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[KpTemplateOut]:
    """Список шаблонов КП для селекта в модалке.

    На MVP отдаём только системные (webstudio / seo / marketing / custom).
    На будущее сюда подмешаются организационные kp_templates.
    """
    rows = await kp_service.list_kp_templates(db)
    return [KpTemplateOut.model_validate(r) for r in rows]


@router.post("/generate", response_model=KpDraftOut)
async def generate_kp(
    payload: KpGenerateRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> KpDraftOut:
    """Сгенерировать КП. Принимает либо company_id, либо site_lead_id (XOR).

    Возможные ошибки (понятные сообщения для UI):
      404 — компания/site-лид/шаблон не найдены.
      400 — для custom-шаблона не пришёл custom_sender_profile,
            либо передано и company_id и site_lead_id одновременно
            (валидируется в pydantic).
      503 — LLM-ассистент не настроен.
      422 — LLM дважды вернула невалидный JSON.

    Эпик A (2026-06-12): если у компании нет проанализированных болей —
    больше не бросаем 409, генерим «общее» КП по шаблону.

    Эпик F (2026-06-12): site_lead_id → ветка build_kp_prompt_for_site
    с контекстом (url + entry + entry_meaning).

    remaining_free пока всегда None — счётчик месячных лимитов
    появится в Эпике E.
    """
    try:
        if payload.site_lead_id is not None:
            result = await kp_service.generate_kp_for_site(
                db,
                user_id=user_id,
                site_lead_id=payload.site_lead_id,
                template_key=payload.template_key,
                tone=payload.tone,
                custom_sender_profile=payload.custom_sender_profile,
            )
        else:
            assert payload.company_id is not None  # гарантировано валидатором
            result = await kp_service.generate_kp(
                db,
                user_id=user_id,
                company_id=payload.company_id,
                template_key=payload.template_key,
                tone=payload.tone,
                custom_sender_profile=payload.custom_sender_profile,
            )
    except kp_service.KpGenerationError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)

    return KpDraftOut(
        id=result.draft_row.id,
        company_id=result.draft_row.company_id,
        site_lead_id=result.draft_row.site_lead_id,
        template_key=result.draft_row.template_key,
        subject=result.draft_row.subject,
        body=result.draft_row.body,
        arguments_used=KpArgumentsUsed(**result.arguments_used),
        remaining_free=None,
        created_at=result.draft_row.created_at,
    )


def _job_to_out(
    job, recent_drafts: list | None = None
) -> KpBulkJobOut:
    return KpBulkJobOut(
        id=job.id,
        status=job.status,
        template_key=job.template_key,
        tone=job.tone,
        total=job.total,
        generated=job.generated,
        failed=job.failed,
        last_company_id=job.last_company_id,
        cancel_requested=job.cancel_requested,
        error_message=job.error_message,
        created_at=job.created_at,
        started_at=job.started_at,
        finished_at=job.finished_at,
        recent_drafts=[
            KpBulkDraftPreview.model_validate(d) for d in (recent_drafts or [])
        ],
    )


@router.post("/bulk-generate", response_model=KpBulkJobOut)
async def bulk_generate_kp(
    payload: KpBulkGenerateRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> KpBulkJobOut:
    """Создаёт KpGenerationJob и ставит Celery-task generate_kp_bulk_task.

    Возвращает свежесозданный job в status='queued' — фронт открывает
    модалку прогресса и поллит GET /outreach/kp/jobs/{id}.

    Ошибки:
      400 — пустой/слишком большой список company_ids, нет валидных id.
      503 — Celery недоступен (broker down).
    """
    try:
        job = await kp_bulk_service.create_bulk_job(
            db,
            user_id=user_id,
            company_ids=payload.company_ids,
            template_key=payload.template_key,
            tone=payload.tone,
            custom_sender_profile=payload.custom_sender_profile,
        )
    except kp_bulk_service.BulkJobError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)

    # Импорт здесь, а не сверху: ленивый — на CI без redis/celery импорт
    # модуля задач не должен валить весь роутер при сборе схемы.
    try:
        from app.modules.outreach.tasks import generate_kp_bulk_task

        generate_kp_bulk_task.delay(job.id)
    except Exception as e:  # broker недоступен и т.п.
        logger.error("bulk_generate_kp: failed to enqueue job=%d: %s", job.id, e)
        job.status = "failed"
        job.error_message = "Не удалось поставить задачу в очередь. Попробуй ещё раз."
        await db.commit()
        await db.refresh(job)
        raise HTTPException(
            status_code=503,
            detail="Очередь задач недоступна. Попробуй ещё раз через минуту.",
        )

    return _job_to_out(job, recent_drafts=[])


@router.get("/jobs/{job_id}", response_model=KpBulkJobOut)
async def get_bulk_job(
    job_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> KpBulkJobOut:
    """Статус bulk-job + последние 5 сгенерированных drafts. Фронт поллит
    раз в ~1.5 сек.
    """
    view = await kp_bulk_service.get_job_view(
        db, user_id=user_id, job_id=job_id, drafts_limit=5
    )
    if view is None:
        raise HTTPException(status_code=404, detail="Задача не найдена.")
    return _job_to_out(view.job, recent_drafts=view.recent_drafts)


@router.get("/drafts", response_model=KpDraftListResponse)
async def list_drafts(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> KpDraftListResponse:
    """Все КП юзера для вкладки «КП» в History.

    Body режется до 240 символов как preview — открыть полное письмо
    можно по клику (UI откроет KpModal в режиме просмотра).
    """
    items, total = await kp_bulk_service.list_user_drafts(
        db, user_id=user_id, limit=limit, offset=offset
    )
    return KpDraftListResponse(
        items=[
            KpDraftListItem(
                id=row.draft.id,
                company_id=row.draft.company_id,
                site_lead_id=row.draft.site_lead_id,
                company_name=row.company_name,
                company_city=row.company_city,
                template_key=row.draft.template_key,
                subject=row.draft.subject,
                body_preview=(row.draft.body or "")[:240],
                created_at=row.draft.created_at,
            )
            for row in items
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("/jobs/{job_id}/cancel", response_model=KpBulkJobOut)
async def cancel_bulk_job(
    job_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> KpBulkJobOut:
    """Просит task'у остановиться. Idempotent: если job уже в финальном
    статусе — возвращает текущее состояние без изменений.
    """
    try:
        job = await kp_bulk_service.request_cancel(
            db, user_id=user_id, job_id=job_id
        )
    except kp_bulk_service.BulkJobError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    return _job_to_out(job)
