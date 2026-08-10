"""Email conversation threads API — мессенджер переписки с клиентами.

Эндпоинты:
  GET    /email/threads                  — список тредов (как чаты)
  GET    /email/threads/{id}             — переписка (все сообщения треда)
  POST   /email/threads/{id}/messages    — отправить ответ клиенту
  PATCH  /email/threads/{id}/read        — отметить прочитанным
  PATCH  /email/threads/{id}/archive     — архивировать

Тред = диалог с одним контактом. Объединяет исходящие КП (email_logs) и
входящие ответы (email_replies) в единую переписку через thread_id.
"""

import logging
from datetime import datetime, timezone
from email.utils import make_msgid
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.models.email import EmailLog, EmailStatus
from app.models.email_reply import EmailReply
from app.models.email_thread import EmailThread
from app.models.email_provider_config import EmailProviderConfig

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/email", tags=["email"])


# ─── Schemas ──────────────────────────────────────────────────────────────


class ThreadMessage(BaseModel):
    """Одно сообщение в переписке (исходящее или входящее)."""

    id: int
    direction: str  # "outgoing" | "incoming"
    subject: Optional[str] = None
    body: Optional[str] = None
    timestamp: Optional[datetime] = None
    status: Optional[str] = None  # для исходящих: sent/failed/...
    message_id: Optional[str] = None  # RFC Message-ID (для threading)


class ThreadDetail(BaseModel):
    """Полная переписка треда со всеми сообщениями."""

    id: int
    contact_email: str
    contact_name: Optional[str] = None
    subject: Optional[str] = None
    is_archived: bool = False
    messages: List[ThreadMessage] = []


class ThreadListItem(BaseModel):
    """Элемент списка тредов (для левой колонки мессенджера)."""

    id: int
    contact_email: str
    contact_name: Optional[str] = None
    subject: Optional[str] = None
    last_message_at: Optional[datetime] = None
    last_message_preview: Optional[str] = None
    last_message_direction: Optional[str] = None
    unread_count: int = 0
    is_archived: bool = False


class SendMessageBody(BaseModel):
    """Тело запроса отправки ответа клиенту из мессенджера."""

    body: str


def _serialize_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """UTC-aware сериализация (как в campaigns_router)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


# ─── Эндпоинты ────────────────────────────────────────────────────────────


@router.get("/threads", response_model=List[ThreadListItem])
async def list_threads(
    archived: bool = Query(False, description="Показывать архив"),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Список тредов (как чаты в мессенджере), отсортированных по последнему сообщению."""
    result = await db.execute(
        select(EmailThread)
        .where(
            EmailThread.user_id == user_id,
            EmailThread.is_archived == archived,
        )
        .order_by(EmailThread.last_message_at.desc().nullslast())
        .limit(limit)
        .offset(offset)
    )
    threads = result.scalars().all()
    return [
        ThreadListItem(
            id=t.id,
            contact_email=t.contact_email,
            contact_name=t.contact_name,
            subject=t.subject,
            last_message_at=_serialize_utc(t.last_message_at),
            last_message_preview=t.last_message_preview,
            last_message_direction=t.last_message_direction,
            unread_count=t.unread_count or 0,
            is_archived=t.is_archived,
        )
        for t in threads
    ]


@router.get("/threads/{thread_id}", response_model=ThreadDetail)
async def get_thread(
    thread_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Полная переписка треда: исходящие КП + входящие ответы, хронологически."""
    thread = await db.get(EmailThread, thread_id)
    if not thread or thread.user_id != user_id:
        raise HTTPException(status_code=404, detail="Thread not found")

    # Исходящие (email_logs этого треда)
    outgoing = await db.execute(
        select(EmailLog).where(EmailLog.thread_id == thread_id).order_by(EmailLog.sent_at.asc())
    )
    # Входящие (email_replies этого треда)
    incoming = await db.execute(
        select(EmailReply).where(EmailReply.thread_id == thread_id).order_by(EmailReply.received_at.asc())
    )

    messages: List[ThreadMessage] = []
    for log in outgoing.scalars():
        messages.append(
            ThreadMessage(
                id=log.id,
                direction="outgoing",
                subject=log.subject,
                body=log.body_preview,
                timestamp=_serialize_utc(log.sent_at or log.created_at),
                status=log.status,
                message_id=log.external_message_id,
            )
        )
    for reply in incoming.scalars():
        messages.append(
            ThreadMessage(
                id=reply.id,
                direction="incoming",
                subject=reply.subject,
                body=reply.body_text,
                timestamp=_serialize_utc(reply.received_at),
                status=None,
                message_id=reply.in_reply_to,
            )
        )

    # Сортировка по времени (исходящие/входящие вперемешку, хронологически)
    messages.sort(key=lambda m: m.timestamp or datetime.min.replace(tzinfo=timezone.utc))

    return ThreadDetail(
        id=thread.id,
        contact_email=thread.contact_email,
        contact_name=thread.contact_name,
        subject=thread.subject,
        is_archived=thread.is_archived,
        messages=messages,
    )


@router.post("/threads/{thread_id}/messages", response_model=ThreadMessage)
async def send_thread_message(
    thread_id: int,
    body: SendMessageBody,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Отправить ответ клиенту из мессенджера.

    Письмо уходит через email_service (force_provider — активный канал) с
    правильными заголовками для threading: In-Reply-To, References, Message-ID,
    Subject: Re: ... Создаёт запись в email_logs с thread_id.
    """
    from app.modules.email.service import EmailServiceError, email_service

    thread = await db.get(EmailThread, thread_id)
    if not thread or thread.user_id != user_id:
        raise HTTPException(status_code=404, detail="Thread not found")

    if not body.body.strip():
        raise HTTPException(status_code=400, detail="Текст ответа пуст")

    # Генерируем RFC Message-ID для нашего ответа (для продолжения треда).
    message_id = make_msgid(idstring=f"reply-{thread_id}-{int(datetime.utcnow().timestamp())}", domain="spinlid.ru")

    # Subject: Re: <оригинальная тема> (если ещё нет Re:)
    subject = thread.subject or "Переписка"
    if not subject.lower().startswith("re:"):
        subject = f"Re: {subject}"

    # from_email: dmitry@spinlid-team.ru (как просил пользователь —
    # ответы от этого ящика, чтобы продолжать переписку по IMAP).
    tw_result = await db.execute(select(EmailProviderConfig).where(EmailProviderConfig.provider_id == "timeweb"))
    tw = tw_result.scalar_one_or_none()
    from_email = tw.from_email if tw else None
    from_name = "Дмитрий, SpinLid"

    # Создаём запись в email_logs (исходящее сообщение треда).
    log = EmailLog(
        user_id=user_id,
        to_email=thread.contact_email,
        subject=subject,
        status=EmailStatus.PENDING.value,
        thread_id=thread_id,
        external_message_id=message_id,
    )
    db.add(log)
    await db.flush()

    try:
        await email_service.send_email(
            to_email=thread.contact_email,
            subject=subject,
            body=body.body,
            from_email=from_email,
            from_name=from_name,
            reply_to=from_email,
            db=db,
            force_provider="timeweb",
        )
        log.status = EmailStatus.SENT.value
        log.sent_at = datetime.utcnow()
        log.body_preview = body.body
    except EmailServiceError as e:
        log.status = EmailStatus.FAILED.value
        log.error_message = str(e)[:500]
        log.error_code = "SEND_FAILED"
        db.add(log)
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Ошибка отправки: {e}")

    db.add(log)
    await db.commit()

    # Обновляем кеш thread.
    thread.last_message_at = datetime.utcnow()
    thread.last_message_preview = body.body[:500]
    thread.last_message_direction = "outgoing"
    thread.updated_at = datetime.utcnow()
    db.add(thread)
    await db.commit()

    return ThreadMessage(
        id=log.id,
        direction="outgoing",
        subject=subject,
        body=body.body,
        timestamp=_serialize_utc(log.sent_at),
        status=log.status,
        message_id=message_id,
    )


@router.patch("/threads/{thread_id}/read")
async def mark_thread_read(
    thread_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Отметить все входящие ответы треда как прочитанные (сброс unread)."""
    thread = await db.get(EmailThread, thread_id)
    if not thread or thread.user_id != user_id:
        raise HTTPException(status_code=404, detail="Thread not found")

    thread.unread_count = 0
    thread.updated_at = datetime.utcnow()
    db.add(thread)

    # Помечаем все ответы как is_read=True
    result = await db.execute(
        select(EmailReply).where(
            EmailReply.thread_id == thread_id,
            EmailReply.is_read == False,  # noqa: E712
        )
    )
    for reply in result.scalars():
        reply.is_read = True
        db.add(reply)

    await db.commit()
    return {"ok": True, "thread_id": thread_id}


@router.patch("/threads/{thread_id}/archive")
async def archive_thread(
    thread_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Архивировать тред (скрыть из основного списка)."""
    thread = await db.get(EmailThread, thread_id)
    if not thread or thread.user_id != user_id:
        raise HTTPException(status_code=404, detail="Thread not found")

    thread.is_archived = True
    thread.updated_at = datetime.utcnow()
    db.add(thread)
    await db.commit()
    return {"ok": True, "thread_id": thread_id}
