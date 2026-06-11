"""Сервис для site_leads (Эпик F фокус-релиза «КП-конвейер»).

Тонкая обёртка вокруг SiteLead-модели: создать, прочитать список,
удалить. Логика поиска по сайтам остаётся в `modules/searches/` —
здесь мы только сохраняем выбранный юзером результат под КП.

Извлечение domain из URL — через urllib.parse, без сторонних библиотек.
"""

from __future__ import annotations

import logging
from urllib.parse import urlparse

from sqlalchemy import desc, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.site_lead import SiteLead
from app.models.organization import user_organizations

logger = logging.getLogger(__name__)


def extract_domain(url: str) -> str:
    """Достаём чистый домен из URL. Без www-префикса, lower-case.

    'https://www.example.com/path' → 'example.com'
    'http://Example.com:8080'      → 'example.com'
    'broken'                        → 'broken' (как fallback)
    """
    try:
        parsed = urlparse(url)
        host = parsed.hostname or parsed.netloc or url
    except Exception:
        host = url
    host = (host or "").strip().lower()
    if host.startswith("www."):
        host = host[4:]
    # Отрезаем порт если был.
    if ":" in host:
        host = host.split(":", 1)[0]
    return host[:255] or "unknown"


async def _resolve_user_organization_id(
    db: AsyncSession, user_id: int
) -> int | None:
    row = (
        await db.execute(
            select(user_organizations.c.organization_id)
            .where(user_organizations.c.user_id == user_id)
            .order_by(user_organizations.c.organization_id.asc())
            .limit(1)
        )
    ).first()
    return int(row[0]) if row else None


async def create_site_lead(
    db: AsyncSession,
    *,
    user_id: int,
    query: str,
    entry: str,
    url: str,
    title: str | None = None,
    snippet: str | None = None,
    search_id: int | None = None,
) -> SiteLead:
    """Создаёт SiteLead или возвращает существующий (по uq_user_url_entry).

    Идемпотентно: повторный вызов с теми же (user_id, url, entry) вернёт
    ту же запись. Нужно, чтобы юзер не плодил дубликаты, кликая на одну
    и ту же карточку результата.
    """
    domain = extract_domain(url)
    organization_id = await _resolve_user_organization_id(db, user_id)
    lead = SiteLead(
        user_id=user_id,
        organization_id=organization_id,
        search_id=search_id,
        query=query[:500],
        entry=(entry or "")[:500],
        url=url[:2000],
        domain=domain,
        title=title[:500] if title else None,
        snippet=snippet,
    )
    db.add(lead)
    try:
        await db.commit()
    except IntegrityError:
        # Тот же (user_id, url, entry) уже есть — возвращаем существующий.
        await db.rollback()
        existing = (
            await db.execute(
                select(SiteLead).where(
                    SiteLead.user_id == user_id,
                    SiteLead.url == url[:2000],
                    SiteLead.entry == (entry or "")[:500],
                )
            )
        ).scalar_one_or_none()
        if existing is None:
            # Маловероятно — может быть racing другой uniqueness. Перебрасываем.
            raise
        return existing
    await db.refresh(lead)
    return lead


async def list_site_leads(
    db: AsyncSession, *, user_id: int, limit: int = 100
) -> list[SiteLead]:
    rows = (
        await db.execute(
            select(SiteLead)
            .where(SiteLead.user_id == user_id)
            .order_by(desc(SiteLead.created_at))
            .limit(limit)
        )
    ).scalars().all()
    return list(rows)


async def get_site_lead(
    db: AsyncSession, *, user_id: int, lead_id: int
) -> SiteLead | None:
    lead = await db.get(SiteLead, lead_id)
    if lead is None or lead.user_id != user_id:
        return None
    return lead


async def delete_site_lead(
    db: AsyncSession, *, user_id: int, lead_id: int
) -> bool:
    lead = await get_site_lead(db, user_id=user_id, lead_id=lead_id)
    if lead is None:
        return False
    await db.delete(lead)
    await db.commit()
    return True
