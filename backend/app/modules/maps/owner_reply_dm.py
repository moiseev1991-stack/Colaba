"""Поиск ЛПР через подписи в ответах владельца на отзывы — 2026-07-16.

Юзер (Дима, 16.07): «иногда подпись "— Мария, PR-менеджер". Парсим
regex'ом».

Ответ владельца обычно заканчивается подписью:
    «С уважением, Иван Петров»
    «— Мария Иванова, PR-менеджер»
    «Ваш администратор Ольга»
    «Директор клиники — Пётр Сергеевич»

regex ловит очевидные патерны (быстро и бесплатно). Оставшийся текст
уходит в LLM для сложных случаев («Меня зовут Марина, и я отвечу…»).

Требует Review.owner_reply_text — заполняется провайдерами (google_maps
уже; twogis/yandex_maps — TBD).

Идемпотентность: skip если запись source='owner_reply' < 30 дней.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company_decision_maker import CompanyDecisionMaker
from app.models.maps import Company, Review
from app.modules.maps._dm_persist import persist_dm_persons
from app.modules.reviews_ai.llm import call_llm_extract_dm_from_text


logger = logging.getLogger(__name__)


_REPROCESS_AFTER_DAYS = 30
_MAX_REPLIES = 30

# Простые regex-подписи. Ловят «типовые» финальные строки ответов. Если
# ничего не сматчилось — фоллбэк на LLM.
_SIGNATURE_PATTERNS: tuple[re.Pattern[str], ...] = (
    # «С уважением, Иван Петров» / «С уважением, Марина»
    re.compile(
        r"с\s+уважением[,\s]+([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+){0,2})",
        re.IGNORECASE,
    ),
    # «— Мария Иванова, PR-менеджер» / «— Ирина, администратор»
    re.compile(
        r"[—\-–]\s*([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+){0,2})(?:[,;]\s*([А-ЯЁа-яё\-]+(?:\s+[А-ЯЁа-яё\-]+){0,3}))?",
    ),
    # «Ваш администратор Ольга»
    re.compile(
        r"ваш(?:а)?\s+([а-яё\-]+)\s+([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?)",
        re.IGNORECASE,
    ),
    # «Меня зовут Марина» / «Меня зовут Иван Петров»
    re.compile(
        r"меня\s+зовут\s+([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+){0,2})",
        re.IGNORECASE,
    ),
)


def _regex_signatures(reply_texts: list[str]) -> list[dict]:
    """Дешёвый regex-парсер подписей. Возвращает список персон в формате
    совместимом с persist_dm_persons.

    role_category=None (не знаем), confidence_hint=0.5 (regex попал в
    типовой паттерн — уверенности средне).
    """
    seen: set[str] = set()
    result: list[dict] = []
    for text in reply_texts:
        if not text:
            continue
        for pat in _SIGNATURE_PATTERNS:
            for m in pat.finditer(text):
                # group(1) — имя, group(2) — иногда роль (для «Мария, PR»).
                # Для «Ваш администратор Ольга» — group(1) роль, group(2) имя.
                groups = m.groups()
                # Определяем, где имя, где пост, по эвристике «имя с большой».
                candidates = [g for g in groups if g]
                name = None
                post = None
                for g in candidates:
                    g = g.strip()
                    if g and g[0].isupper() and re.match(r"^[А-ЯЁ][а-яё\-]+(?:\s+[А-ЯЁ][а-яё\-]+)*$", g):
                        name = g
                    elif g and g[0].islower():
                        post = g
                if not name:
                    continue
                key = name.lower()
                if key in seen:
                    continue
                seen.add(key)
                result.append({
                    "name": name,
                    "post": post,
                    "role_category": None,
                    "contact_email": None,
                    "contact_vk": None,
                    "contact_phone": None,
                    "confidence_hint": 0.5,
                })
    return result


async def enrich_dm_from_owner_replies(
    db: AsyncSession,
    company_id: int,
    *,
    force: bool = False,
) -> dict:
    """Поиск ЛПР через подписи в ответах владельца компании на отзывы."""
    company = await db.get(Company, company_id)
    if company is None:
        return {"status": "not_found_company"}

    if not force:
        cutoff = datetime.now(timezone.utc) - timedelta(days=_REPROCESS_AFTER_DAYS)
        recent = (await db.execute(
            select(CompanyDecisionMaker.id)
            .where(CompanyDecisionMaker.company_id == company_id)
            .where(CompanyDecisionMaker.source == "owner_reply")
            .where(CompanyDecisionMaker.created_at >= cutoff)
            .limit(1)
        )).scalar_one_or_none()
        if recent is not None:
            return {"status": "skip_already_processed"}

    rows = (await db.execute(
        select(Review.owner_reply_text)
        .where(Review.company_id == company_id)
        .where(Review.owner_reply_text.isnot(None))
        .order_by(Review.posted_at.desc().nullslast())
        .limit(_MAX_REPLIES)
    )).all()

    reply_texts = [
        (r[0] or "").strip()
        for r in rows
        if r[0] and len(r[0].strip()) >= 20
    ]
    if not reply_texts:
        return {"status": "no_owner_replies", "replies": 0, "saved": 0}

    # 1. Быстрый regex-проход.
    regex_persons = _regex_signatures(reply_texts)

    # 2. LLM-проход по всем ответам разом — вылавливает нестандартные
    #    подписи, которые regex пропустил. Использует общий экстрактор.
    llm_persons: list[dict] = []
    combined_text = "\n---\n".join(reply_texts[:15])
    llm_extracted = await call_llm_extract_dm_from_text(
        db,
        company_name=company.name or "",
        text=combined_text,
        source_hint="ответы владельца компании на отзывы (обычно подписаны)",
    )
    if llm_extracted:
        llm_persons = llm_extracted

    # 3. Мержим — дедупим по имени (LLM выигрывает: у неё role_category).
    merged: dict[str, dict] = {}
    for p in regex_persons:
        merged[p["name"].lower()] = p
    for p in llm_persons:
        key = (p.get("name") or "").lower()
        if not key:
            continue
        # LLM'овская запись перезаписывает regex'овскую (у LLM больше полей).
        merged[key] = p

    if not merged:
        return {"status": "no_persons", "replies": len(reply_texts), "saved": 0}

    saved = await persist_dm_persons(
        db,
        company_id=company_id,
        persons=list(merged.values()),
        source="owner_reply",
        source_url=None,
        default_confidence=0.55,  # владелец сам подписался — доверия больше
    )
    await db.commit()
    return {
        "status": "ok",
        "replies": len(reply_texts),
        "regex_hits": len(regex_persons),
        "llm_hits": len(llm_persons),
        "saved": saved,
    }
