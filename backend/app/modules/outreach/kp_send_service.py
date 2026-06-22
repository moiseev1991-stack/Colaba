"""Сервис отправки КП по выбранным каналам (миграция 038).

С страницы партии `/app/leads/kp-jobs/{id}` юзер выбирает каналы
(email/telegram/whatsapp/max) и жмёт «Отправить (N)». Сервис:

  1. Берёт все KpDraft этого job'а (фильтр по company_id ∈ company_ids
     + created_at >= started_at — тот же критерий, что в list_job_items).
  2. На каждый draft × каждый канал создаёт строку KpSend в статусе
     'queued' (если адрес есть) или 'skipped' (нет email/коннектора).
  3. Возвращает количество созданных queued-строк, чтобы фронт сразу
     понял, что отправлять есть что; Celery-task `send_kp_batch_task`
     разгребает очередь и шлёт.

Канал email — реально шлёт через EmailService (Hyvor/SMTP).
Каналы telegram/whatsapp/max — пока создают skipped-строки с
error_code='channel_unavailable' (UI показывает их как «коннектор
ещё в работе»). Когда появится TG-бот/WA-провайдер — добавится здесь
конкретная ветка отправки.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import and_, func as sa_func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.kp_draft import KpDraft
from app.models.kp_generation_job import KpGenerationJob
from app.models.kp_send import KpSend
from app.models.maps import Company
from app.models.organization import user_organizations
from app.modules.outreach import whatsapp_greenapi
from app.modules.outreach.phone_utils import (
    is_russian_mobile,
    normalize_phone,
)

logger = logging.getLogger(__name__)


SUPPORTED_CHANNELS = ("email", "telegram", "whatsapp", "max")
EMAIL_CHANNELS = ("email",)
# Реально отправляющие каналы. telegram/max сейчас всегда skipped — для них
# нет коннектора (TG-бот заложен, но не дописан; MAX — нет публичного API).
PHONE_CHANNELS = ("whatsapp",)


class SendError(Exception):
    """Ошибка bulk-send-сервиса с человекочитаемым сообщением."""

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass
class EnqueueResult:
    job_id: int
    created: int  # сколько строк KpSend записали (queued + skipped)
    queued: int   # из них в queued (реально пойдут в worker)
    skipped: int  # из них skipped (без адреса / канал недоступен)


def _looks_like_email(value: str) -> bool:
    if "@" not in value:
        return False
    domain = value.split("@", 1)[1]
    return "." in domain


def pick_first_email(emails: list | None) -> str | None:
    """Первый валидный email из переданного списка (JSONB list или
    объединённого списка из company_contacts).

    Без БД — чистая функция. Используется когда у нас уже на руках список
    кандидатов (см. collect_company_emails). История: до 2026-06-21 эта
    функция читала только company.emails JSONB — но реальные контакты
    у большинства компаний лежат в company_contacts (per-source scrape).
    Из-за этого preview показывал «нет email-а», а на карточке компании
    адрес был. Теперь источник кандидатов — внешний.
    """
    if not isinstance(emails, list):
        return None
    for raw in emails:
        if not raw:
            continue
        value = str(raw).strip()
        if _looks_like_email(value):
            return value
    return None


async def collect_company_emails(
    db: AsyncSession, company_ids: list[int]
) -> dict[int, list[str]]:
    """company_id → объединённый и дедуплицированный список email-кандидатов.

    Берёт из двух источников:
      1. companies.emails JSONB (легаси-кэш, заполняется крауллером 2GIS).
      2. company_contacts.value WHERE type='email' (per-source, заполняется
         тасками 2GIS / Яндекс / Google, актуальнее всего).

    Если компания есть в обоих источниках — мерджим, сохраняя порядок
    (сначала JSONB-кэш, потом per-source). is_primary=true в
    company_contacts поднимаем наверх — обычно это email из карточки на
    карте, а не из футера сайта.
    """
    if not company_ids:
        return {}

    out: dict[int, list[str]] = {cid: [] for cid in company_ids}

    rows = (
        await db.execute(
            select(Company.id, Company.emails).where(Company.id.in_(company_ids))
        )
    ).all()
    for cid, emails in rows:
        if not isinstance(emails, list):
            continue
        for raw in emails:
            if not raw:
                continue
            value = str(raw).strip()
            if value and _looks_like_email(value) and value not in out[int(cid)]:
                out[int(cid)].append(value)

    contact_rows = (
        await db.execute(
            text(
                """
                SELECT company_id, value, COALESCE(is_primary, false) AS is_primary
                FROM company_contacts
                WHERE company_id = ANY(:ids) AND type = 'email'
                ORDER BY is_primary DESC, id ASC
                """
            ),
            {"ids": list(company_ids)},
        )
    ).all()
    for cid, value, _is_primary in contact_rows:
        if not value:
            continue
        s = str(value).strip()
        if s and _looks_like_email(s) and s not in out[int(cid)]:
            out[int(cid)].append(s)

    return out


async def collect_company_phones(
    db: AsyncSession, company_ids: list[int]
) -> dict[int, list[str]]:
    """company_id → объединённый и дедуплицированный список телефонов-кандидатов.

    Берёт из двух источников (зеркалит collect_company_emails):
      1. companies.phone — основной телефон из карточки источника (2GIS/
         Yandex), как пришёл. Часто spaced/dashes ("+7 (495) 123-45-67").
      2. company_contacts.value WHERE type='phone' — per-source, может
         содержать несколько номеров (отдел продаж + общий + директор).
         is_primary=true поднимаем наверх — это обычно номер из карточки.

    Возвращает сырые строки в исходном виде; нормализацию делает потребитель
    (pick_first_mobile в phone_utils). Это позволяет UI / xlsx показывать
    «как было», но WhatsApp-канал точно отбирать только мобильные.
    """
    if not company_ids:
        return {}

    out: dict[int, list[str]] = {cid: [] for cid in company_ids}

    rows = (
        await db.execute(
            select(Company.id, Company.phone).where(Company.id.in_(company_ids))
        )
    ).all()
    for cid, phone in rows:
        if not phone:
            continue
        value = str(phone).strip()
        if value and value not in out[int(cid)]:
            out[int(cid)].append(value)

    contact_rows = (
        await db.execute(
            text(
                """
                SELECT company_id, value, COALESCE(is_primary, false) AS is_primary
                FROM company_contacts
                WHERE company_id = ANY(:ids) AND type = 'phone'
                ORDER BY is_primary DESC, id ASC
                """
            ),
            {"ids": list(company_ids)},
        )
    ).all()
    for cid, value, _is_primary in contact_rows:
        if not value:
            continue
        s = str(value).strip()
        if s and s not in out[int(cid)]:
            out[int(cid)].append(s)

    return out


def pick_first_mobile_phone(raw_phones: list | None) -> str | None:
    """Первый valid РФ-мобильный (digits-only, 79XXXXXXXXX) из сырых
    номеров. None если ни одного. GreenAPI отказывается слать на
    городские и зарубежные → отбор тут, чтобы не плодить failed."""
    if not isinstance(raw_phones, list):
        return None
    for raw in raw_phones:
        digits = normalize_phone(str(raw) if raw is not None else None)
        if is_russian_mobile(digits):
            return digits
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


async def enqueue_job_send(
    db: AsyncSession,
    *,
    user_id: int,
    job_id: int,
    channels: list[str],
    only_draft_ids: list[int] | None = None,
) -> EnqueueResult:
    """Создаёт KpSend-строки по всем готовым КП партии × выбранным каналам.

    Дублей не делает: если для пары (draft_id, channel) уже есть KpSend
    в статусе queued/sending/sent — пропускает. Failed/skipped считаем
    «можно ретраить», создаём новую строку.

    only_draft_ids — если задан, фильтруем готовые драфты по этому списку
    (per-row resend одной/нескольких КП после правки). None → все готовые
    драфты партии (полный bulk-send из SendBar).
    """
    channels = list(dict.fromkeys(channels))  # dedup, сохраняем порядок
    if not channels:
        raise SendError("Не выбран ни один канал отправки.", status_code=400)
    invalid = [c for c in channels if c not in SUPPORTED_CHANNELS]
    if invalid:
        raise SendError(
            f"Неизвестные каналы: {', '.join(invalid)}.", status_code=400
        )

    job = await db.get(KpGenerationJob, job_id)
    if job is None or job.user_id != user_id:
        raise SendError("Партия не найдена.", status_code=404)
    if job.status not in ("done", "running", "cancelled"):
        # На queued ещё нет смысла слать — генерация даже не началась.
        raise SendError(
            "Сначала дождись окончания генерации этой партии.", status_code=400
        )

    company_ids = [int(c) for c in (job.company_ids or [])]
    if not company_ids:
        raise SendError("В партии нет компаний.", status_code=400)

    since = job.started_at or job.created_at

    # Все готовые драфты этого job'а.
    draft_rows = list(
        (
            await db.execute(
                select(KpDraft, Company)
                .outerjoin(Company, Company.id == KpDraft.company_id)
                .where(
                    KpDraft.user_id == user_id,
                    KpDraft.created_at >= since,
                    KpDraft.company_id.in_(company_ids),
                )
                .order_by(KpDraft.created_at.asc())
            )
        ).all()
    )
    if not draft_rows:
        raise SendError(
            "В партии пока нет готовых КП для отправки.", status_code=400
        )

    # Один draft на компанию — на случай, если юзер перегенерил вручную
    # между итерациями. Берём ПЕРВЫЙ по времени, как в list_job_items.
    drafts_by_company: dict[int, tuple[KpDraft, Company | None]] = {}
    for kp, company in draft_rows:
        cid = int(kp.company_id) if kp.company_id is not None else None
        if cid is None:
            continue
        if cid not in drafts_by_company:
            drafts_by_company[cid] = (kp, company)

    if not drafts_by_company:
        raise SendError(
            "В партии пока нет готовых КП для отправки.", status_code=400
        )

    if only_draft_ids:
        allowed = {int(i) for i in only_draft_ids if i is not None}
        drafts_by_company = {
            cid: pair
            for cid, pair in drafts_by_company.items()
            if int(pair[0].id) in allowed
        }
        if not drafts_by_company:
            raise SendError(
                "Указанные КП не найдены в этой партии или ещё не готовы.",
                status_code=400,
            )

    draft_ids = [kp.id for kp, _ in drafts_by_company.values()]
    # Уже существующие активные KpSend (queued/sending/sent) — не дублим.
    existing_pairs: set[tuple[int, str]] = set()
    if draft_ids:
        existing_rows = (
            await db.execute(
                select(KpSend.draft_id, KpSend.channel).where(
                    KpSend.user_id == user_id,
                    KpSend.draft_id.in_(draft_ids),
                    KpSend.status.in_(("queued", "sending", "sent")),
                )
            )
        ).all()
        existing_pairs = {(int(r[0]), str(r[1])) for r in existing_rows}

    organization_id = await _resolve_user_organization_id(db, user_id)

    # Адресаты для всех компаний партии — берём из обоих источников
    # (companies.emails JSONB + company_contacts). Раньше брали только
    # JSONB и для половины компаний возвращали None, хотя email лежал
    # в company_contacts (карточка компании показывала, KP — нет).
    company_ids_for_lookup = [int(cid) for cid in drafts_by_company.keys()]
    emails_by_company = await collect_company_emails(db, company_ids_for_lookup)
    # Телефоны — только если в каналах есть whatsapp; для email-only партии
    # лишний SELECT по company_contacts не нужен.
    phones_by_company: dict[int, list[str]] = {}
    if any(c in PHONE_CHANNELS for c in channels):
        phones_by_company = await collect_company_phones(
            db, company_ids_for_lookup
        )
    wa_configured = whatsapp_greenapi.is_configured()

    created = 0
    queued = 0
    skipped = 0
    rows_to_add: list[KpSend] = []

    for cid, (draft, _company) in drafts_by_company.items():
        for channel in channels:
            if (int(draft.id), channel) in existing_pairs:
                # Уже отправлено / в очереди — не дублим.
                continue
            if channel == "email":
                recipient = pick_first_email(emails_by_company.get(int(cid)))
            elif channel == "whatsapp":
                recipient = pick_first_mobile_phone(phones_by_company.get(int(cid)))
            else:
                recipient = None
            status = "queued"
            error_code: str | None = None
            error_message: str | None = None

            if channel == "email":
                if not recipient:
                    status = "skipped"
                    error_code = "no_recipient"
                    error_message = "У компании не найден email-адрес."
            elif channel == "whatsapp":
                if not wa_configured:
                    status = "skipped"
                    error_code = "greenapi_not_configured"
                    error_message = (
                        "WhatsApp-коннектор не настроен — добавь GreenAPI "
                        "ключи в окружении бэкенда."
                    )
                elif not recipient:
                    status = "skipped"
                    error_code = "no_mobile_phone"
                    error_message = (
                        "У компании нет мобильного телефона РФ — WhatsApp "
                        "не примет городские/зарубежные номера."
                    )
            else:
                status = "skipped"
                error_code = "channel_unavailable"
                error_message = (
                    "Канал в работе — коннектор появится позже. "
                    "Пока отправляем только по email и WhatsApp."
                )

            row = KpSend(
                user_id=user_id,
                organization_id=organization_id,
                job_id=job.id,
                draft_id=int(draft.id),
                company_id=cid,
                channel=channel,
                recipient=recipient,
                status=status,
                error_code=error_code,
                error_message=error_message,
            )
            rows_to_add.append(row)
            created += 1
            if status == "queued":
                queued += 1
            elif status == "skipped":
                skipped += 1

    if rows_to_add:
        db.add_all(rows_to_add)
        await db.commit()

    return EnqueueResult(job_id=int(job.id), created=created, queued=queued, skipped=skipped)


async def get_job_send_status(
    db: AsyncSession,
    *,
    user_id: int,
    job_id: int,
) -> dict | None:
    """Сводка для поллинга UI: сколько в каком статусе для этой партии.
    None — партия не найдена / не принадлежит юзеру.
    """
    job = await db.get(KpGenerationJob, job_id)
    if job is None or job.user_id != user_id:
        return None

    counters = (
        await db.execute(
            select(KpSend.status, sa_func.count(KpSend.id))
            .where(KpSend.user_id == user_id, KpSend.job_id == job_id)
            .group_by(KpSend.status)
        )
    ).all()
    by_status = {str(s): int(c) for s, c in counters}

    queued = by_status.get("queued", 0)
    sending = by_status.get("sending", 0)
    sent = by_status.get("sent", 0)
    failed = by_status.get("failed", 0)
    skipped = by_status.get("skipped", 0)
    total = queued + sending + sent + failed + skipped

    last_error_row = (
        await db.execute(
            select(KpSend.error_message)
            .where(
                KpSend.user_id == user_id,
                KpSend.job_id == job_id,
                KpSend.status == "failed",
                KpSend.error_message.isnot(None),
            )
            .order_by(KpSend.created_at.desc())
            .limit(1)
        )
    ).first()
    last_error = str(last_error_row[0]) if last_error_row else None

    return {
        "job_id": int(job.id),
        "total": total,
        "queued": queued,
        "sending": sending,
        "sent": sent,
        "failed": failed,
        "skipped": skipped,
        "is_active": (queued + sending) > 0,
        "last_error": last_error,
    }


@dataclass
class SendListRow:
    send: KpSend
    company_name: str | None
    company_city: str | None
    subject: str | None
    template_key: str | None


async def list_user_sends(
    db: AsyncSession,
    *,
    user_id: int,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[SendListRow], int]:
    """Все отправки юзера — для вкладки «Отправки» в /history.
    JOIN'им с companies и kp_drafts чтобы дать UI имя компании + subject.
    """
    total = int(
        (
            await db.execute(
                select(sa_func.count(KpSend.id)).where(KpSend.user_id == user_id)
            )
        ).scalar_one()
        or 0
    )

    rows = (
        await db.execute(
            select(
                KpSend,
                Company.name,
                Company.city,
                KpDraft.subject,
                KpDraft.template_key,
            )
            .outerjoin(Company, Company.id == KpSend.company_id)
            .outerjoin(KpDraft, KpDraft.id == KpSend.draft_id)
            .where(KpSend.user_id == user_id)
            .order_by(KpSend.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()

    items = [
        SendListRow(
            send=r[0],
            company_name=r[1],
            company_city=r[2],
            subject=r[3],
            template_key=r[4],
        )
        for r in rows
    ]
    return items, total


async def claim_queued_sends_for_job(
    db: AsyncSession, *, job_id: int, batch_size: int = 20
) -> list[KpSend]:
    """Воркер забирает следующую пачку KpSend в статусе queued этого job'а
    и переводит их в 'sending'. Лочим UPDATE'ом по id-списку, чтобы
    несколько воркеров не дублили отправку.
    """
    candidate_rows = (
        await db.execute(
            select(KpSend)
            .where(KpSend.job_id == job_id, KpSend.status == "queued")
            .order_by(KpSend.created_at.asc(), KpSend.id.asc())
            .limit(batch_size)
            .with_for_update(skip_locked=True)
        )
    ).scalars().all()
    if not candidate_rows:
        return []

    for row in candidate_rows:
        row.status = "sending"
        row.sent_at = None
        row.error_code = None
        row.error_message = None
    await db.commit()
    for row in candidate_rows:
        await db.refresh(row)
    return list(candidate_rows)


def mark_send_sent(
    send: KpSend,
    *,
    provider_message_id: str | None = None,
) -> None:
    send.status = "sent"
    send.sent_at = datetime.now(timezone.utc)
    send.provider_message_id = provider_message_id
    send.error_code = None
    send.error_message = None


def mark_send_failed(
    send: KpSend,
    *,
    error_message: str,
    error_code: str = "send_failed",
) -> None:
    send.status = "failed"
    send.error_code = error_code
    send.error_message = error_message[:1000] if error_message else None
