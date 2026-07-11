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

from app.models.company_legal import CompanyLegal
from app.models.kp_draft import KpDraft
from app.models.kp_generation_job import KpGenerationJob
from app.models.kp_send import KpSend
from app.models.maps import Company
from app.models.organization import user_organizations
from app.modules.outreach.kp_send_service import (
    collect_company_emails,
    pick_first_email,
)

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


def _extract_company_logo_url(raw_data: dict | None) -> str | None:
    """Возвращает URL логотипа компании из Company.raw_data (2GIS).

    Источники по убыванию приоритета: топ-уровневый `logo`/`logo_url`/`icon`,
    либо вложенный `external_content.brand.{logo_url,url}`. Возвращаем None
    если не нашли — фронт нарисует initials-аватарку. Дубликат логики из
    maps/website_leads_export._extract_logo_url, чтобы не тянуть импорт
    цепочки website-leads в outreach.
    """
    if not isinstance(raw_data, dict):
        return None
    for key in ("logo", "logo_url", "icon"):
        v = raw_data.get(key)
        if isinstance(v, str) and v.startswith("http"):
            return v
    ec = raw_data.get("external_content")
    if isinstance(ec, dict):
        brand = ec.get("brand")
        if isinstance(brand, dict):
            url = brand.get("logo_url") or brand.get("url")
            if isinstance(url, str) and url.startswith("http"):
                return url
    return None


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
    pain_tag_ids: list[int] | None = None,
    use_4hods: bool = False,
    channel: str = "email",
    my_offer_step: str | None = None,
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

    # 2026-07-12: собираем options только когда есть что положить, иначе
    # оставляем NULL — для видимости в UI/history что это классическая джоба.
    options: dict | None = None
    extras: dict = {}
    if pain_tag_ids:
        extras["pain_tag_ids"] = list(pain_tag_ids)
    if use_4hods:
        extras["use_4hods"] = True
        extras["channel"] = channel
        if my_offer_step:
            extras["my_offer_step"] = my_offer_step
    if extras:
        options = extras

    organization_id = await _resolve_user_organization_id(db, user_id)
    job = KpGenerationJob(
        user_id=user_id,
        organization_id=organization_id,
        status="queued",
        template_key=template_key,
        tone=tone,
        custom_sender_profile=custom_sender_profile,
        options=options,
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


@dataclass
class JobItemRow:
    """Строка таблицы на странице партии: компания + per-row статус
    + (если готов) поля draft'а. Используется в list_job_items.
    """

    company_id: int | None
    company_name: str | None
    company_city: str | None
    company_legal_short: str | None
    status: str  # queued | running | done | failed
    draft: KpDraft | None
    recipient_email: str | None = None
    # URL логотипа компании, если 2GIS его отдал в raw_data. Для UI-
    # аватарки в таблице партии и в шапке drawer'а. None — фронт
    # рисует инициалы из company_name (детерминированный цвет по hash).
    company_logo_url: str | None = None
    # Основной телефон компании (как лежит в companies.phone — обычно
    # spaced/dashes из 2GIS, без нормализации). Используется фронтом
    # как fallback-канал «нет email → wa.me/{phone}»; нормализация
    # делается на фронте, т.к. wa.me требует digits-only.
    company_phone: str | None = None
    # Статус последней email-отправки этого draft'а (sent/queued/sending/
    # failed/skipped) — чтобы UI после reload показывал «✓ Отправлено»
    # на RowSendButton и не давал случайно отправить второй раз. None —
    # ещё не пытались отправить через bulk-bar или per-row send.
    email_send_status: str | None = None
    # ИНН компании (company_legal.inn) — для раскрывающегося списка
    # «Кто получит КП» в SendBar, чтобы юзер мог опознать компанию по
    # юридическим реквизитам и снять галочку «не слать».
    company_inn: str | None = None
    # Полное юридическое наименование (company_legal.legal_name) —
    # «Общество с ограниченной ответственностью Ромашка». Для того же
    # SendBar-списка. Если нет — фронт fallback'нется на company_name.
    company_legal_full: str | None = None
    # Адрес компании (companies.address) — для SendBar-списка, чтобы
    # юзер видел «куда» вообще шлёт.
    company_address: str | None = None


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


async def list_job_items(
    db: AsyncSession, *, user_id: int, job_id: int
) -> tuple[KpGenerationJob, list[JobItemRow]] | None:
    """Все компании bulk-job'а в их исходном порядке + per-row статус
    (queued/running/done/failed) + (если готов) draft. Используется на
    странице партии /app/leads/kp-jobs/{id} — табличный вид.

    Статус компании выводится из:
      - наличия KpDraft на эту company_id, созданного после job.started_at
        (значит, юзер сгенерировал это письмо именно в рамках этого job'а),
      - позиции company_id в job.company_ids относительно job.last_company_id
        (всё, что левее last — task уже прошёл; всё, что правее — в очереди),
      - терминального состояния job'а (cancelled/failed/done).

    Точная FK draft→job не ведётся — bulk-task использует существующий
    generate_kp, который не знает про job_id. company_id-окно достаточно
    строго фильтрует «свои» драфты.
    """
    job = await db.get(KpGenerationJob, job_id)
    if job is None or job.user_id != user_id:
        return None

    company_ids = [int(c) for c in (job.company_ids or [])]

    if not company_ids:
        return job, []

    since = job.started_at or job.created_at

    # 1. Резолвим имена/города/OPF/ИНН/полное юр. название/адрес для всех
    # компаний job'а одним запросом.
    # company_legal_short = CompanyLegal.opf («ООО»/«ИП»/«АО»/«ПАО»),
    # а не legal_short_name (это полное наименование без ИП/ООО) —
    # последнее даёт длинные пиллы и ломает таблицу.
    # ИНН/legal_name/address добавлены для раскрывающегося списка
    # «Кто получит КП» в SendBar (см. JobItemRow).
    company_rows = (
        await db.execute(
            select(
                Company.id,
                Company.name,
                Company.city,
                CompanyLegal.opf,
                Company.raw_data,
                Company.phone,
                CompanyLegal.inn,
                CompanyLegal.legal_name,
                Company.address,
            )
            .outerjoin(CompanyLegal, CompanyLegal.company_id == Company.id)
            .where(Company.id.in_(company_ids))
        )
    ).all()
    # Ключи кортежа: 0=name, 1=city, 2=opf, 3=logo_url, 4=phone, 5=inn,
    # 6=legal_name (полное), 7=address.
    company_meta: dict[
        int,
        tuple[
            str | None, str | None, str | None, str | None, str | None,
            str | None, str | None, str | None,
        ],
    ] = {
        int(r[0]): (
            r[1], r[2], r[3], _extract_company_logo_url(r[4]), r[5],
            r[6], r[7], r[8],
        )
        for r in company_rows
    }

    # Адресаты считаем отдельно — берём из обоих источников
    # (companies.emails JSONB + company_contacts), как при реальной
    # отправке. Без этого preview мог сказать «нет email», хотя в карточке
    # компании контакт был (он лежал в company_contacts, а не в JSONB).
    emails_by_company = await collect_company_emails(db, company_ids)

    # 2. Драфты, относящиеся к этому job'у — по company_id ∈ список + окно времени.
    draft_rows = list(
        (
            await db.execute(
                select(KpDraft)
                .where(
                    KpDraft.user_id == user_id,
                    KpDraft.created_at >= since,
                    KpDraft.company_id.in_(company_ids),
                )
                .order_by(KpDraft.created_at.asc())
            )
        ).scalars().all()
    )
    # Если на одну компанию вдруг несколько драфтов (юзер перегенерил
    # вручную одиночной кнопкой между итерациями) — берём первый,
    # принадлежащий именно этому проходу.
    draft_by_company: dict[int, KpDraft] = {}
    for d in draft_rows:
        if d.company_id is None:
            continue
        if d.company_id not in draft_by_company:
            draft_by_company[int(d.company_id)] = d

    # 2.5. Последний статус email-отправки по каждому draft'у (для
    # подсветки RowSendButton после reload, чтобы не давать случайный
    # дубль). Берём самую свежую запись KpSend по (draft_id, email).
    # Приоритет статусов: sent > sending > queued > failed > skipped —
    # «sent» залипает, чтобы юзер не пытался переотправить успех.
    draft_ids_list = [int(d.id) for d in draft_rows]
    email_status_by_draft: dict[int, str] = {}
    if draft_ids_list:
        send_rows = (
            await db.execute(
                select(KpSend.draft_id, KpSend.status, KpSend.created_at)
                .where(
                    KpSend.user_id == user_id,
                    KpSend.draft_id.in_(draft_ids_list),
                    KpSend.channel == "email",
                )
                .order_by(KpSend.created_at.desc())
            )
        ).all()
        _priority = {"sent": 5, "sending": 4, "queued": 3, "failed": 2, "skipped": 1}
        for did, status, _created in send_rows:
            did_int = int(did)
            current = email_status_by_draft.get(did_int)
            if current is None:
                email_status_by_draft[did_int] = str(status)
            else:
                if _priority.get(str(status), 0) > _priority.get(current, 0):
                    email_status_by_draft[did_int] = str(status)

    # 3. Позиция last_company_id — для определения «уже прошли» vs «ещё впереди».
    last_idx = -1
    if job.last_company_id is not None:
        try:
            last_idx = company_ids.index(int(job.last_company_id))
        except ValueError:
            last_idx = -1

    job_status = job.status

    items: list[JobItemRow] = []
    for i, cid in enumerate(company_ids):
        meta = company_meta.get(cid)
        draft = draft_by_company.get(cid)
        if draft is not None:
            status = "done"
        elif job_status in ("done", "cancelled", "failed"):
            # Job уже завершён, а draft нет — компания пропущена/упала.
            status = "failed"
        elif job_status == "queued":
            status = "queued"
        else:
            # job_status == 'running'. Опираемся на last_company_id.
            if i < last_idx:
                # Task уже прошёл мимо этой компании, drafts нет — fail.
                status = "failed"
            elif i == last_idx:
                # Текущая итерация: draft ещё не успел записаться.
                status = "running"
            else:
                status = "queued"

        items.append(
            JobItemRow(
                company_id=cid,
                company_name=meta[0] if meta else None,
                company_city=meta[1] if meta else None,
                company_legal_short=meta[2] if meta else None,
                status=status,
                draft=draft,
                recipient_email=pick_first_email(emails_by_company.get(cid)),
                company_logo_url=meta[3] if meta else None,
                company_phone=meta[4] if meta else None,
                email_send_status=(
                    email_status_by_draft.get(int(draft.id))
                    if draft is not None
                    else None
                ),
                company_inn=meta[5] if meta else None,
                company_legal_full=meta[6] if meta else None,
                company_address=meta[7] if meta else None,
            )
        )

    return job, items


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
