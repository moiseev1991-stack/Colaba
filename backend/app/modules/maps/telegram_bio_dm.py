"""Поиск ЛПР через публичное bio Telegram-канала/чата — 2026-07-16.

Юзер (Дима, 16.07): «Instagram/Telegram-био — если в контактах есть
ссылка, тянем bio: часто там "Марина, SMM"».

Как это работает
----------------
1. Собираем handles Telegram из company_contacts (type='telegram') и
   Company.contacts_extra['telegrams'].
2. Для каждого handle дёргаем публичную preview-страницу https://t.me/{h}
   (Telegram отдаёт HTML с og:title, og:description, description).
3. Склеиваем title+description всех каналов в один текст → LLM извлекает
   имена сотрудников (call_llm_extract_dm_from_text, source_hint="bio
   Telegram-каналов компании").
4. Сохраняем с source='telegram_bio'.

Без Telegram API — работаем только с публичной preview-страницей. Это
даёт нам «Описание» и «Название» канала, чего достаточно для случаев
«Автор: Марина Иванова, SMM-специалист» или «PR-менеджер @Ivanova_pr».

Ограничения
-----------
- Preview есть только у публичных каналов/чатов. Private-inviteлинки
  вернут пустую страницу.
- Мы не парсим сообщения канала — только описание. Для сообщений нужен
  Telegram API + бот-токен, отдельная задача.

Идемпотентность: skip если запись source='telegram_bio' < 30 дней.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from html import unescape

import httpx
from bs4 import BeautifulSoup
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company_decision_maker import CompanyDecisionMaker
from app.models.maps import Company, CompanyContact
from app.modules.maps._dm_persist import persist_dm_persons
from app.modules.reviews_ai.llm import call_llm_extract_dm_from_text


logger = logging.getLogger(__name__)


_TIMEOUT = httpx.Timeout(15.0, connect=10.0)
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)
_REPROCESS_AFTER_DAYS = 30
_MAX_HANDLES_PER_COMPANY = 5


def _normalize_handle(raw: str) -> str | None:
    """t.me/xxx / @xxx / xxx → xxx (только a-z0-9_)."""
    if not raw or not isinstance(raw, str):
        return None
    s = raw.strip().lower()
    for prefix in ("https://", "http://"):
        if s.startswith(prefix):
            s = s[len(prefix):]
    for prefix in ("t.me/", "telegram.me/", "tg://resolve?domain="):
        if s.startswith(prefix):
            s = s[len(prefix):]
    if s.startswith("@"):
        s = s[1:]
    # Убираем query string
    s = s.split("?", 1)[0].split("/", 1)[0]
    # Валидация Telegram-handle: буквы, цифры, подчёркивания, длина 3..32
    if not re.match(r"^[a-z0-9_]{3,32}$", s):
        return None
    # Некоторые «сервисные» handles игнорируем — не про сотрудников
    if s in {"telegram", "durov", "share", "start"}:
        return None
    return s


async def _collect_handles(db: AsyncSession, company: Company) -> list[str]:
    """Возвращает уникальные handles компании из всех источников."""
    handles: list[str] = []
    seen: set[str] = set()

    # 1. CompanyContact type='telegram'
    rows = (await db.execute(
        select(CompanyContact.value)
        .where(CompanyContact.company_id == company.id)
        .where(CompanyContact.type == "telegram")
    )).scalars().all()
    for v in rows:
        h = _normalize_handle(v)
        if h and h not in seen:
            seen.add(h)
            handles.append(h)

    # 2. contacts_extra.telegrams
    extra = company.contacts_extra or {}
    for v in (extra.get("telegrams") or []):
        h = _normalize_handle(v)
        if h and h not in seen:
            seen.add(h)
            handles.append(h)

    return handles[:_MAX_HANDLES_PER_COMPANY]


def _extract_bio(html: str) -> str:
    """Достаёт «человеческий» текст со страницы https://t.me/{handle}.

    Telegram отдаёт preview-страницу с og:title (название канала) и
    og:description (описание). Также tgme_page_description содержит
    развёрнутый bio (для приватных каналов будет заглушка).
    Возвращаем сконкатенированный текст, обрезанный до 4КБ.
    """
    if not html:
        return ""
    soup = BeautifulSoup(html, "html.parser")
    parts: list[str] = []

    og_title = soup.find("meta", {"property": "og:title"})
    if og_title and og_title.get("content"):
        parts.append(og_title["content"].strip())

    og_desc = soup.find("meta", {"property": "og:description"})
    if og_desc and og_desc.get("content"):
        parts.append(og_desc["content"].strip())

    for cls in ("tgme_page_description", "tgme_channel_info_description"):
        for el in soup.select(f".{cls}"):
            parts.append(el.get_text(" ", strip=True))

    text = " ".join(p for p in parts if p)
    text = unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:4000]


async def _fetch_bio(handle: str) -> str:
    """Открывает https://t.me/{handle} и возвращает bio-текст. Пусто при
    любой ошибке — таск не роняем."""
    url = f"https://t.me/{handle}"
    try:
        async with httpx.AsyncClient(
            timeout=_TIMEOUT,
            follow_redirects=True,
            headers={
                "User-Agent": _UA,
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "ru-RU,ru;q=0.9",
            },
        ) as client:
            r = await client.get(url)
    except Exception as e:
        logger.debug("telegram_bio_dm: fetch %s failed: %s", url, e)
        return ""
    if r.status_code >= 400:
        return ""
    return _extract_bio(r.text)


async def enrich_dm_from_telegram_bio(
    db: AsyncSession,
    company_id: int,
    *,
    force: bool = False,
) -> dict:
    """Поиск ЛПР по публичному bio Telegram-каналов компании."""
    company = await db.get(Company, company_id)
    if company is None:
        return {"status": "not_found_company"}

    if not force:
        cutoff = datetime.now(timezone.utc) - timedelta(days=_REPROCESS_AFTER_DAYS)
        recent = (await db.execute(
            select(CompanyDecisionMaker.id)
            .where(CompanyDecisionMaker.company_id == company_id)
            .where(CompanyDecisionMaker.source == "telegram_bio")
            .where(CompanyDecisionMaker.created_at >= cutoff)
            .limit(1)
        )).scalar_one_or_none()
        if recent is not None:
            return {"status": "skip_already_processed"}

    handles = await _collect_handles(db, company)
    if not handles:
        return {"status": "no_telegram", "handles": 0, "saved": 0}

    bios: list[str] = []
    for h in handles:
        bio = await _fetch_bio(h)
        if bio and len(bio) > 20:
            bios.append(f"[t.me/{h}] {bio}")

    if not bios:
        return {"status": "no_bio_text", "handles": len(handles), "saved": 0}

    text = "\n\n".join(bios)
    persons = await call_llm_extract_dm_from_text(
        db,
        company_name=company.name or "",
        text=text,
        source_hint="bio Telegram-каналов компании (публичные preview-страницы)",
    )
    if persons is None:
        return {"status": "llm_unavailable", "handles": len(handles), "saved": 0}
    if not persons:
        return {"status": "no_persons", "handles": len(handles), "saved": 0}

    saved = await persist_dm_persons(
        db,
        company_id=company_id,
        persons=persons,
        source="telegram_bio",
        source_url=f"https://t.me/{handles[0]}",
        default_confidence=0.55,
    )
    await db.commit()
    return {
        "status": "ok",
        "handles": len(handles),
        "bios_ok": len(bios),
        "extracted": len(persons),
        "saved": saved,
    }
