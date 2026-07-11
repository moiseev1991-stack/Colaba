"""Celery-задачи модуля outreach.

Очередь maps_ai — туда же ходят reviews_ai.tasks, потому что и там, и
тут LLM (один пул ассистентов outreach_draft) и неважно, чья задача
займёт worker'а первой.

Задачи:
  - generate_kp_bulk_task — bulk-генерация КП по списку company_ids
    (миграция 036).
  - send_kp_batch_task — отправка пачки KpSend в статусе 'queued' по
    job_id через EmailService (миграция 038, 2026-06-21). Запускается
    после POST /outreach/kp/jobs/{job_id}/send.
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.email_config import EmailConfig
from app.models.kp_generation_job import KpGenerationJob
from app.modules.email.service import EmailServiceError, email_service
from app.modules.outreach import (
    kp_bulk_service,
    kp_send_service,
    kp_service,
    sms_smsru,
    whatsapp_greenapi,
)
from app.modules.outreach.kp_html_renderer import (
    DEFAULT_SENDER_SIGNATURE_TEXT,
    render_kp_html,
)
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
                # 2026-07-12: job.options содержит опциональные параметры
                # (pain_tag_ids/use_4hods/channel/my_offer_step) —
                # пробрасываем в generate_kp. Legacy-джобы имеют options=NULL,
                # generate_kp тогда работает по старым дефолтам.
                opts = dict(job.options or {})
                await kp_service.generate_kp(
                    db,
                    user_id=job.user_id,
                    company_id=int(company_id),
                    template_key=job.template_key,
                    tone=job.tone or "neutral",
                    custom_sender_profile=job.custom_sender_profile,
                    pain_tag_ids=opts.get("pain_tag_ids"),
                    use_4hods=bool(opts.get("use_4hods", False)),
                    channel=opts.get("channel", "email"),
                    my_offer_step=opts.get("my_offer_step"),
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


# --- Отправка КП -----------------------------------------------------------

# Пачка KpSend, которую один прогон task'а вытягивает за раз. На бывших
# bulk-партиях у Димы максимум ~150 строк (75 компаний × до 2 каналов),
# 20 за раз даёт ~8 прогонов и не блокирует SMTP'шный пул.
_SEND_BATCH_SIZE = 20

# Пауза между отправками внутри пачки. Hyvor сам rate-limit'ит на 10/sec,
# SMTP-сервер юзера обычно ещё медленнее — 0.4 сек даёт ~150 писем/мин,
# хватит для типовой партии в 75 шт.
_PER_SEND_SLEEP_SEC = 0.4


async def _load_email_branding(db) -> tuple[str | None, str | None, str | None]:
    """Достаёт из EmailConfig поля для html-обёртки КП (миграция 039).

    Возвращает (signature_html, logo_url, brand_color). Любое поле может быть
    None/пустым — рендерер скрывает соответствующий блок. Если EmailConfig
    вообще не создан (новая инсталляция) — отдаём (None, None, None).
    """
    row = (
        await db.execute(select(EmailConfig).where(EmailConfig.id == 1))
    ).scalar_one_or_none()
    if row is None:
        return None, None, None
    return (
        (row.sender_signature_html or None),
        (row.sender_logo_url or None),
        (row.sender_brand_color or None),
    )


async def _send_one(db, send_row) -> None:
    from app.models.kp_draft import KpDraft

    draft = await db.get(KpDraft, send_row.draft_id)
    if draft is None:
        kp_send_service.mark_send_failed(
            send_row,
            error_message="Черновик КП исчез — отправка невозможна.",
            error_code="draft_missing",
        )
        return

    if not send_row.recipient:
        kp_send_service.mark_send_failed(
            send_row,
            error_message="Адрес получателя пуст.",
            error_code="no_recipient",
        )
        return

    if send_row.channel == "email":
        await _send_one_email(db, send_row, draft)
        return
    if send_row.channel == "whatsapp":
        await _send_one_whatsapp(send_row, draft)
        return
    if send_row.channel == "sms":
        await _send_one_sms(send_row, draft)
        return
    if send_row.channel == "telegram":
        await _send_one_telegram(send_row, draft)
        return

    # MAX и любые будущие каналы — enqueue для них пишет skipped, до сюда
    # дойти не должно. Если дошли — фиксируем failed.
    kp_send_service.mark_send_failed(
        send_row,
        error_message="Канал ещё не подключен.",
        error_code="channel_unavailable",
    )


async def _send_one_email(db, send_row, draft) -> None:
    signature_html, logo_url, brand_color = await _load_email_branding(db)
    plain_body = draft.body or ""
    html_body = render_kp_html(
        body_md=plain_body,
        logo_url=logo_url,
        signature_html=signature_html,
        brand_color=brand_color,
    )

    try:
        result = await email_service.send_email(
            to_email=send_row.recipient,
            subject=draft.subject or "Предложение",
            body=plain_body,
            html_body=html_body,
            db=db,
        )
        kp_send_service.mark_send_sent(
            send_row,
            provider_message_id=(result.get("external_message_id") or result.get("message_id")),
        )
    except EmailServiceError as e:
        kp_send_service.mark_send_failed(send_row, error_message=str(e))
    except Exception as e:  # noqa: BLE001
        logger.exception(
            "send_kp_batch_task: unexpected error send_id=%s draft_id=%s: %s",
            send_row.id,
            send_row.draft_id,
            e,
        )
        kp_send_service.mark_send_failed(
            send_row,
            error_message=f"Внутренняя ошибка отправки: {e}"[:1000],
            error_code="internal",
        )


def _compose_whatsapp_text(draft) -> str:
    """Текст WhatsApp-сообщения: subject (если есть) + тело КП в plain-text.

    WhatsApp обрезает сообщение на ~4096 символах. Тело КП у нас обычно
    400-1200 символов, так что upper-bound безопасный. Если subject и body
    не пусты — сшиваем через "\\n\\n", чтобы тема выглядела как заголовок.
    """
    subject = (getattr(draft, "subject", "") or "").strip()
    body = (getattr(draft, "body", "") or "").strip()
    if subject and body:
        text = f"{subject}\n\n{body}"
    elif body:
        text = body
    elif subject:
        text = subject
    else:
        text = "Здравствуйте! Хочу предложить вам наше решение."
    # Контакты отправителя в конце — чтобы получатель знал, кто пишет и как
    # ответить. Тело режем с запасом, оставляя место под подпись (лимит WA 4096).
    body_limit = 4000 - len(DEFAULT_SENDER_SIGNATURE_TEXT) - 2
    return f"{text[:body_limit]}\n\n{DEFAULT_SENDER_SIGNATURE_TEXT}"


async def _send_one_whatsapp(send_row, draft) -> None:
    text = _compose_whatsapp_text(draft)
    try:
        message_id = await whatsapp_greenapi.send_text_message(
            send_row.recipient, text
        )
        kp_send_service.mark_send_sent(send_row, provider_message_id=message_id)
    except whatsapp_greenapi.WhatsAppSendError as e:
        kp_send_service.mark_send_failed(
            send_row, error_message=e.message, error_code=e.code
        )
    except Exception as e:  # noqa: BLE001
        logger.exception(
            "send_kp_batch_task: unexpected WA error send_id=%s draft_id=%s: %s",
            send_row.id,
            send_row.draft_id,
            e,
        )
        kp_send_service.mark_send_failed(
            send_row,
            error_message=f"Внутренняя ошибка WhatsApp-отправки: {e}"[:1000],
            error_code="internal",
        )


def _compose_sms_text(draft) -> str:
    """Текст SMS: короткое уведомление о КП (не весь КП!).

    SMS — самый дорогой канал (~2-5 ₽ за 70 знаков кириллицей). Отправлять
    полный КП здесь неоправданно (15-40 ₽ за сообщение). Стратегия: короткое
    уведомление «Отправили вам КП» с CTA. Максимум 300 знаков (~4 сегмента,
    ~10-12 ₽), чтобы получатель прочёл и решил перейти к длинному варианту
    (email/WA).
    """
    subject = (getattr(draft, "subject", "") or "").strip()
    body = (getattr(draft, "body", "") or "").strip()
    # Тизер: первое предложение body — обычно приветствие и суть.
    # Если body короткий — берём как есть.
    if body:
        first_sentence = body.split(".")[0].strip()
        teaser = first_sentence[:180]
    else:
        teaser = subject[:180] if subject else "Здравствуйте! Есть предложение по маркетингу для вас."
    tail = f" — {DEFAULT_SENDER_SIGNATURE_TEXT[:100]}"
    max_body_len = 300 - len(tail)
    return f"{teaser[:max_body_len]}{tail}"


async def _send_one_sms(send_row, draft) -> None:
    text = _compose_sms_text(draft)
    try:
        message_id = await sms_smsru.send_text_message(send_row.recipient, text)
        kp_send_service.mark_send_sent(send_row, provider_message_id=message_id)
    except sms_smsru.SmsSendError as e:
        kp_send_service.mark_send_failed(
            send_row, error_message=e.message, error_code=e.code
        )
    except Exception as e:  # noqa: BLE001
        logger.exception(
            "send_kp_batch_task: unexpected SMS error send_id=%s draft_id=%s: %s",
            send_row.id,
            send_row.draft_id,
            e,
        )
        kp_send_service.mark_send_failed(
            send_row,
            error_message=f"Внутренняя ошибка SMS-отправки: {e}"[:1000],
            error_code="internal",
        )


def _compose_telegram_text(draft) -> str:
    """Текст КП для Telegram: subject + body, HTML-формат, лимит 4000 символов.

    Telegram поддерживает parse_mode='HTML' (теги <b>, <i>, <a>, <br>).
    Лимит 4096, режем с запасом на 4000.
    """
    body_limit = 3800  # запас на subject + разделители + подпись
    subject = (draft.subject or "Предложение").strip()
    body = (draft.body or "").strip()
    if len(body) > body_limit:
        body = body[:body_limit].rstrip() + "…"
    # Простой markdown-→-HTML: **жирный** → <b>жирный</b>, переносы сохраняем.
    import re

    body_html = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", body)
    return f"<b>{_escape_html(subject)}</b>\n\n{body_html}"


def _escape_html(text: str) -> str:
    """Экранирует <, >, & для Telegram HTML parse_mode."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


async def _send_one_telegram(send_row, draft) -> None:
    from app.modules.outreach import telegram_bot

    text = _compose_telegram_text(draft)
    try:
        message_id = await telegram_bot.send_text_message(
            send_row.recipient, text, parse_mode="HTML"
        )
        kp_send_service.mark_send_sent(send_row, provider_message_id=message_id)
    except telegram_bot.TelegramSendError as e:
        kp_send_service.mark_send_failed(
            send_row, error_message=e.message, error_code=e.code
        )
    except Exception as e:  # noqa: BLE001
        logger.exception(
            "send_kp_batch_task: unexpected TG error send_id=%s draft_id=%s: %s",
            send_row.id,
            send_row.draft_id,
            e,
        )
        kp_send_service.mark_send_failed(
            send_row,
            error_message=f"Внутренняя ошибка Telegram-отправки: {e}"[:1000],
            error_code="internal",
        )


async def _send_kp_batch_async(job_id: int) -> dict:
    total_sent = 0
    total_failed = 0

    # Несколько итераций по _SEND_BATCH_SIZE — обрабатываем всю очередь
    # за один прогон task'а, чтобы не плодить chain'ы Celery-ретвитов.
    while True:
        async with AsyncSessionLocal() as db:
            claimed = await kp_send_service.claim_queued_sends_for_job(
                db, job_id=job_id, batch_size=_SEND_BATCH_SIZE
            )
            if not claimed:
                break

            for send_row in claimed:
                await _send_one(db, send_row)
                await asyncio.sleep(_PER_SEND_SLEEP_SEC)
                if send_row.status == "sent":
                    total_sent += 1
                elif send_row.status == "failed":
                    total_failed += 1

            await db.commit()

    return {"job_id": job_id, "sent": total_sent, "failed": total_failed}


@celery_app.task(
    name="send_kp_batch_task",
    queue="maps_ai",
    bind=True,
    max_retries=0,
)
def send_kp_batch_task(self, job_id: int):
    """Отправляет все KpSend в статусе 'queued' для job_id.

    Идемпотентна по дизайну: claim переводит row в 'sending' под FOR
    UPDATE SKIP LOCKED, второй параллельный воркер не подхватит уже
    взятые. Если что-то упало посередине — следующий запуск довыгребет
    оставшиеся queued. max_retries=0 — task сам ловит ошибки и пишет
    их в строку (status=failed), снова дёргать смысла нет.
    """
    try:
        return asyncio.run(_send_kp_batch_async(job_id))
    except Exception as exc:
        logger.error(
            "send_kp_batch_task job=%d crashed: %s", job_id, exc, exc_info=True
        )
        raise


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
