"""Shared helper: сохранение LLM-извлечённых персон в company_decision_makers.

Используется 4 модулями (serp_dm / telegram_bio_dm / checko_dm /
owner_reply_dm), которые все возвращают одинаковый формат от
`call_llm_extract_dm_from_text`. Раньше эта логика была скопирована в
team_enrich/reviews_ner_dm — теперь единый path.
"""

from __future__ import annotations

import logging
from typing import Any, Iterable

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company_decision_maker import CompanyDecisionMaker
from app.modules.maps.contact_validation import is_valid_email, is_valid_phone_ru


logger = logging.getLogger(__name__)


def _pick_best_contact(item: dict[str, Any]) -> tuple[str | None, str | None]:
    """(contact_type, contact_value). Приоритет email > vk > phone."""
    email = item.get("contact_email")
    vk = item.get("contact_vk")
    phone = item.get("contact_phone")

    if email:
        ok, _reason, norm = is_valid_email(email, check_mx=False)
        if ok:
            return "email", norm
    if vk:
        return "vk", vk
    if phone:
        ok, _reason, norm = is_valid_phone_ru(phone)
        if ok:
            return "phone", norm
    return None, None


async def persist_dm_persons(
    db: AsyncSession,
    *,
    company_id: int,
    persons: Iterable[dict[str, Any]],
    source: str,
    source_url: str | None = None,
    default_confidence: float = 0.5,
) -> int:
    """Сохраняет LLM-извлечённые персоны в company_decision_makers.

    - source: строка-источник ('serp_google', 'telegram_bio', 'checko',
      'owner_reply') — идёт в CompanyDecisionMaker.source.
    - default_confidence: используется если у персоны нет confidence_hint.
    - is_decision_maker=True для marketing/owner/founder/management/hr;
      False для 'other' и None.

    Возвращает число вставок (без учёта конфликтов по UNIQUE-индексу).
    """
    saved = 0
    for item in persons or []:
        name = (item.get("name") or "").strip()
        if not name:
            continue
        post = item.get("post")
        role_category = item.get("role_category")
        conf_hint = item.get("confidence_hint")
        try:
            confidence = float(conf_hint) if conf_hint is not None else default_confidence
        except (TypeError, ValueError):
            confidence = default_confidence
        confidence = max(0.0, min(0.95, confidence))

        is_dm = role_category in ("marketing", "owner", "founder", "management", "hr")
        contact_type, contact_value = _pick_best_contact(item)

        stmt = pg_insert(CompanyDecisionMaker).values(
            company_id=company_id,
            name=name,
            post=post,
            source=source,
            source_url=(source_url or None) if source_url is None else source_url[:1000],
            confidence=confidence,
            is_decision_maker=is_dm,
            role_category=role_category,
            contact_type=contact_type,
            contact_value=contact_value,
        ).on_conflict_do_nothing()
        try:
            await db.execute(stmt)
            saved += 1
        except Exception as e:
            logger.debug(
                "persist_dm_persons: insert conflict for %s (src=%s): %s",
                name, source, e,
            )
    return saved
