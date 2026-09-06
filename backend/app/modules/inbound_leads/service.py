"""Бизнес-логика приёмника заявок: матчинг с базой, дедуп, уведомления."""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inbound_lead import InboundLead
from app.models.maps import Company
from app.modules.inbound_leads import notify, schemas

logger = logging.getLogger(__name__)

# Держим strong-ref на фоновые задачи уведомлений, иначе GC может убить task
# до завершения (asyncio.create_task хранит только weak-ref).
_bg_notify_tasks: set[asyncio.Task] = set()

# tg_user_id-заявки в этих статусах дописываются, а не создаются заново.
_OPEN_STATUSES = ("new", "in_progress")

# Достаём длинный числовой токен из ссылки 2ГИС/Я.Карт как external_id.
_DIGIT_TOKEN_RE = re.compile(r"\d{6,}")
_URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)

# Телефон в свободном тексте: +7/8 и 10-11 цифр с любыми разделителями.
_PHONE_RE = re.compile(r"(?:\+?[78][\s\-()]*)?(?:\d[\s\-()]*){10,11}")
# Слова, означающие «связь прямо тут, в Telegram».
_HERE_WORDS = ("здесь", "тут", "телеграм", "telegram", "в чате", "сюда", "тг")


def extract_phone(text: str) -> Optional[str]:
    """Вытаскивает телефон из свободного текста; нормализует к 7XXXXXXXXXX."""
    if not text:
        return None
    m = _PHONE_RE.search(text)
    if not m:
        return None
    digits = "".join(c for c in m.group(0) if c.isdigit())
    if digits.startswith("8") and len(digits) == 11:
        digits = "7" + digits[1:]
    if len(digits) == 10 and digits.startswith("9"):
        digits = "7" + digits
    return digits if 10 <= len(digits) <= 11 else None


async def _top_pains(db: AsyncSession, company_id: int, limit: int = 3) -> list[str]:
    """Топ болей компании как ['не дозвониться (7)', ...] для сводки владельцу."""
    try:
        from app.models.pain_tag import CompanyPainScore as CPS, PainTag

        stmt = (
            select(PainTag.label, CPS.mention_count)
            .join(PainTag, PainTag.id == CPS.pain_tag_id)
            .where(
                CPS.company_id == company_id,
                # Только НЕГАТИВНЫЕ активные теги — иначе у компаний с сильным
                # позитивом наверх лезут хвалебные теги («внимательные мастера»),
                # и приветствие бота хвалит клиента вместо указания на боль.
                PainTag.sentiment == "negative",
                PainTag.status == "active",
            )
            .order_by(CPS.mention_count.desc())
            .limit(limit)
        )
        rows = (await db.execute(stmt)).all()
        return [f"{label} ({count})" for label, count in rows]
    except Exception as e:  # noqa: BLE001
        logger.warning("inbound_leads: не удалось получить боли компании %s: %s", company_id, e)
        return []


async def _top_quote(db: AsyncSession, company_id: int) -> str:
    """Лучшая цитата из отзывов компании (макс. similarity) — для разбора владельцу."""
    try:
        from app.models.pain_tag import CompanyPainScore as CPS, PainTag

        stmt = (
            select(CPS.top_quote)
            .join(PainTag, PainTag.id == CPS.pain_tag_id)
            .where(
                CPS.company_id == company_id,
                CPS.top_quote.isnot(None),
                # Цитата — только из негативного тега (боль), не из похвалы.
                PainTag.sentiment == "negative",
                PainTag.status == "active",
            )
            .order_by(CPS.top_quote_similarity.desc().nulls_last())
            .limit(1)
        )
        row = (await db.execute(stmt)).scalar_one_or_none()
        return (row or "").strip()
    except Exception as e:  # noqa: BLE001
        logger.warning("inbound_leads: не удалось получить цитату компании %s: %s", company_id, e)
        return ""


async def company_brief(db: AsyncSession, company_id: int) -> dict:
    """Сводка по компании для уведомления/приветствия: name, niche, city, pains, quote.

    Никогда не бросает — при сбое возвращает пустые поля.
    """
    brief = {"name": "", "niche": "", "city": "", "pains": [], "quote": ""}
    company = await db.get(Company, company_id)
    if company is None:
        return brief
    brief["name"] = company.name or ""
    brief["niche"] = company.niche or ""
    brief["city"] = company.city or ""
    brief["pains"] = await _top_pains(db, company_id)
    brief["quote"] = await _top_quote(db, company_id)
    return brief


async def _resolve_company(
    db: AsyncSession, company_id: Optional[int], company_text: str
) -> Optional[Company]:
    """Приоритет: валидный company_id → по нему; иначе — матчинг по тексту.

    Битый/чужой id молча игнорируется (fallback на текст), чтобы подделанный
    ?c= не создавал заявку на левую компанию.
    """
    if company_id:
        try:
            company = await db.get(Company, company_id)
            if company is not None:
                return company
            logger.info("inbound_leads: company_id=%s не найден, матчу по тексту", company_id)
        except Exception as e:  # noqa: BLE001
            logger.warning("inbound_leads: lookup company_id=%s упал: %s", company_id, e)
    return await match_company(db, company_text)


async def match_company(db: AsyncSession, company_text: str) -> Optional[Company]:
    """Пытается сматчить присланный текст (название/ссылка) с таблицей companies.

    Стратегия:
      1) если это ссылка 2ГИС/Я.Карт — вытащить длинный числовой токен и
         искать по external_id;
      2) иначе — поиск по названию ILIKE, самый «горячий» лид первым.
    Возвращает Company или None. Не бросает исключений.
    """
    text = (company_text or "").strip()
    if len(text) < 3:
        return None
    try:
        url_match = _URL_RE.search(text)
        if url_match and ("2gis" in text.lower() or "yandex" in text.lower() or "ya.ru" in text.lower()):
            token_match = _DIGIT_TOKEN_RE.search(url_match.group(0))
            if token_match:
                stmt = select(Company).where(Company.external_id == token_match.group(0)).limit(1)
                company = (await db.execute(stmt)).scalar_one_or_none()
                if company:
                    return company

        # Фолбэк — по названию. Берём первые 80 символов (без URL), чтобы
        # длинный текст не ломал LIKE.
        name_part = _URL_RE.sub("", text).strip()[:80]
        if len(name_part) < 3:
            return None
        stmt = (
            select(Company)
            .where(Company.name.ilike(f"%{name_part}%"))
            .order_by(Company.lead_temperature.desc().nulls_last())
            .limit(1)
        )
        return (await db.execute(stmt)).scalar_one_or_none()
    except Exception as e:  # noqa: BLE001
        logger.warning("inbound_leads: match_company упал на %r: %s", text[:60], e)
        return None


def _normalize_messages(raw: list) -> list[dict]:
    """Приводит raw_messages к списку {at, text}."""
    now = datetime.utcnow().isoformat()
    out: list[dict] = []
    for item in raw or []:
        if isinstance(item, dict):
            out.append({"at": item.get("at") or now, "text": str(item.get("text", ""))})
        else:
            out.append({"at": now, "text": str(item)})
    return out


async def submit_lead(
    db: AsyncSession, payload: schemas.InboundLeadSubmit
) -> schemas.InboundLeadSubmitResponse:
    """Создаёт заявку (или дописывает существующую от того же tg_user_id),
    матчит компанию и шлёт уведомления. Уведомления — best-effort."""
    new_messages = _normalize_messages(payload.raw_messages)

    # 1) Дедуп по tg_user_id — дописываем открытую заявку.
    existing: Optional[InboundLead] = None
    if payload.source == "tg_bot" and payload.tg_user_id:
        stmt = (
            select(InboundLead)
            .where(
                InboundLead.tg_user_id == payload.tg_user_id,
                InboundLead.status.in_(_OPEN_STATUSES),
            )
            .order_by(InboundLead.created_at.desc())
            .limit(1)
        )
        existing = (await db.execute(stmt)).scalar_one_or_none()

    if existing is not None:
        # Дописываем новые сообщения и дозаполняем пустые поля.
        existing.raw_messages = list(existing.raw_messages or []) + new_messages
        if payload.contact_text and not existing.contact_text:
            existing.contact_text = payload.contact_text
        if payload.company_text and not existing.company_text:
            existing.company_text = payload.company_text
        if payload.name and not existing.name:
            existing.name = payload.name
        if payload.tg_username and not existing.tg_username:
            existing.tg_username = payload.tg_username
        existing.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(existing)
        return schemas.InboundLeadSubmitResponse(
            id=existing.id,
            status=existing.status,
            matched_company_id=existing.matched_company_id,
            is_new=False,
        )

    # 2) Новая заявка. Известный company_id (из deep-link/?c=) — авторитетнее
    #    текстового матчинга: если id существует, берём его; иначе матчим текст.
    company = await _resolve_company(db, payload.company_id, payload.company_text)
    lead = InboundLead(
        source=payload.source,
        source_tag=payload.source_tag or "",
        tg_user_id=payload.tg_user_id,
        tg_username=payload.tg_username,
        name=payload.name or "",
        company_text=payload.company_text or "",
        contact_text=payload.contact_text or "",
        raw_messages=new_messages,
        status="new",
        matched_company_id=company.id if company else None,
        created_at=payload.created_at or datetime.utcnow(),
    )
    db.add(lead)
    await db.commit()
    await db.refresh(lead)

    # 3) Уведомления (best-effort) — В ФОНЕ. TG идёт через медленную SOCKS5-цепочку
    #    (до 3 прокси × 15с), и если ждать её в запросе, шлюз рвёт соединение по
    #    таймауту → форма показывает ошибку, хотя заявка уже сохранена и уведомление
    #    в итоге доходит. Поэтому отвечаем 201 сразу, а уведомляем отдельной задачей.
    _spawn_notify(lead.id)

    return schemas.InboundLeadSubmitResponse(
        id=lead.id,
        status=lead.status,
        matched_company_id=lead.matched_company_id,
        is_new=True,
    )


async def _notify_new_lead_bg(lead_id: int) -> None:
    """Фоновая обёртка уведомления: своя сессия БД (сессия запроса уже закрыта)."""
    from app.core.database import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as db:
            lead = await db.get(InboundLead, lead_id)
            if lead is not None:
                await _notify_new_lead(db, lead)
    except Exception as e:  # noqa: BLE001
        logger.warning("inbound_leads: фоновое уведомление по заявке %s упало: %s", lead_id, e)


def _spawn_notify(lead_id: int) -> None:
    """Планирует уведомление владельцу вне цикла запроса (fire-and-forget)."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        logger.warning("inbound_leads: нет running loop, уведомление по %s пропущено", lead_id)
        return
    task = loop.create_task(_notify_new_lead_bg(lead_id))
    _bg_notify_tasks.add(task)
    task.add_done_callback(_bg_notify_tasks.discard)


async def _notify_new_lead(db: AsyncSession, lead: InboundLead) -> None:
    """Полное уведомление владельцу (TG + email) ровно один раз.

    Дозаполняет matched_company_id, если ещё не сматчено. Ставит owner_notified.
    Best-effort: сбой доставки не роняет флаг False навсегда только если сам
    notify-хелпер проглотил ошибку (он проглатывает). Флаг ставим до отправки,
    чтобы не задваивать при гонке повторных сообщений.
    """
    if lead.owner_notified:
        return
    if not lead.matched_company_id and lead.company_text:
        company = await match_company(db, lead.company_text)
        if company:
            lead.matched_company_id = company.id
    brief: dict = {"name": "", "niche": "", "city": "", "pains": [], "quote": ""}
    if lead.matched_company_id:
        brief = await company_brief(db, lead.matched_company_id)
    lead.owner_notified = True
    lead.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(lead)
    await notify.notify_owner_telegram(lead, brief)
    await notify.notify_owner_email(lead, brief, db=db)


async def handle_bot_message(
    db: AsyncSession,
    *,
    tg_user_id: int,
    tg_username: Optional[str],
    text: str,
    source_tag: str = "",
    is_start: bool = False,
    company_id: Optional[int] = None,
) -> tuple[InboundLead, str, Optional[dict]]:
    """Обрабатывает одно входящее сообщение бота-приёмника.

    Состояние диалога держим в полях заявки (без внешнего стейта):
      company_text пусто          → ждём название компании;
      company_text есть, contact пусто → ждём контакт;
      оба есть                    → «дополнение» (пересылаем владельцу).

    company_id (из deep-link ?start=<группа>_<id>): если валиден — компанию
    уже знаем, matched_company_id ставим сразу, приветствие персональное,
    название НЕ спрашиваем (только контакт).

    Возвращает (lead, phase, start_ctx):
      phase ∈ {greeting, ask_contact, thanks, extra} — ответный текст;
      start_ctx — None для контентных сообщений; на /start —
        {"group": <slug>, "brief": <dict|None>, "company_known": bool}
        для сборки приветствия в webhook.
    """
    stmt = (
        select(InboundLead)
        .where(
            InboundLead.tg_user_id == tg_user_id,
            InboundLead.status.in_(_OPEN_STATUSES),
        )
        .order_by(InboundLead.created_at.desc())
        .limit(1)
    )
    lead = (await db.execute(stmt)).scalar_one_or_none()

    now = datetime.utcnow().isoformat()

    if lead is None:
        lead = InboundLead(
            source="tg_bot",
            source_tag=source_tag or "",
            tg_user_id=tg_user_id,
            tg_username=tg_username,
            raw_messages=[],
            status="new",
        )
        db.add(lead)

    if tg_username and not lead.tg_username:
        lead.tg_username = tg_username
    if source_tag and not lead.source_tag:
        lead.source_tag = source_tag

    # /start — фиксируем вход, ничего не парсим и не уведомляем. Если пришёл
    # валидный company_id — сразу привязываем компанию и готовим персональное
    # приветствие (название не спрашиваем).
    if is_start:
        brief: Optional[dict] = None
        company_known = False
        if company_id and not lead.matched_company_id:
            company = await db.get(Company, company_id)
            if company is not None:
                lead.matched_company_id = company.id
                brief = await company_brief(db, company.id)
                if brief.get("name") and not lead.company_text:
                    # Компанию знаем — фиксируем, чтобы дальше ждать контакт.
                    lead.company_text = brief["name"]
                company_known = True
        elif lead.matched_company_id:
            brief = await company_brief(db, lead.matched_company_id)
            company_known = bool(brief.get("name"))
        lead.raw_messages = list(lead.raw_messages or []) + [{"at": now, "text": "/start"}]
        lead.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(lead)
        phase = "ask_contact" if company_known else "greeting"
        return lead, phase, {"group": source_tag, "brief": brief, "company_known": company_known}

    # Контентное сообщение.
    lead.raw_messages = list(lead.raw_messages or []) + [{"at": now, "text": text}]
    phone = extract_phone(text)
    lower = text.lower()

    if not lead.company_text:
        # Ждали компанию → это она (+ телефон, если сразу прислали).
        lead.company_text = text.strip()
        if phone and not lead.contact_text:
            lead.contact_text = phone
        elif any(w in lower for w in _HERE_WORDS) and not lead.contact_text:
            lead.contact_text = "Telegram (в этом чате)"
    elif not lead.contact_text:
        # Ждали контакт.
        if phone:
            lead.contact_text = phone
        elif any(w in lower for w in _HERE_WORDS):
            lead.contact_text = "Telegram (в этом чате)"
        else:
            lead.contact_text = text.strip()

    lead.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(lead)

    # Уведомление: полное — один раз, когда заявка стала осмысленной; дальше —
    # «дополнение».
    if not lead.owner_notified and (lead.company_text or lead.contact_text):
        await _notify_new_lead(db, lead)
        phase = "thanks" if lead.contact_text else "ask_contact"
        return lead, phase, None

    if lead.owner_notified:
        await notify.forward_extra_to_owner(lead, text)
        return lead, "extra", None

    # Пограничный случай: ещё нечего уведомлять.
    return lead, ("thanks" if lead.contact_text else "ask_contact"), None


async def list_leads(
    db: AsyncSession,
    *,
    status_filter: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[InboundLead], int]:
    stmt = select(InboundLead)
    count_stmt = select(func.count(InboundLead.id))
    if status_filter:
        stmt = stmt.where(InboundLead.status == status_filter)
        count_stmt = count_stmt.where(InboundLead.status == status_filter)
    stmt = stmt.order_by(InboundLead.created_at.desc()).limit(limit).offset(offset)
    items = list((await db.execute(stmt)).scalars().all())
    total = (await db.execute(count_stmt)).scalar_one()
    return items, total


async def update_status(db: AsyncSession, lead_id: int, new_status: str) -> Optional[InboundLead]:
    lead = await db.get(InboundLead, lead_id)
    if not lead:
        return None
    lead.status = new_status
    lead.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(lead)
    return lead
