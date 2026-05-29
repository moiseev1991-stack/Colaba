"""Сервисный слой lead_lists.

CRUD + bulk-добавление компаний + конвертация списка в EmailCampaign.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.email import CampaignStatus, EmailCampaign
from app.models.lead_list import LeadList, LeadListItem
from app.models.maps import Company

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# CRUD lead_lists
# ---------------------------------------------------------------------------


async def create_list(
    db: AsyncSession,
    *,
    user_id: int,
    name: str,
    description: str | None,
    source: str = "maps",
) -> LeadList:
    ll = LeadList(
        user_id=user_id,
        name=name.strip(),
        description=description,
        source=source,
        items_count=0,
    )
    db.add(ll)
    await db.commit()
    await db.refresh(ll)
    return ll


async def list_for_user(db: AsyncSession, *, user_id: int) -> list[LeadList]:
    rows = (
        await db.execute(
            select(LeadList)
            .where(LeadList.user_id == user_id)
            .order_by(LeadList.created_at.desc())
        )
    ).scalars().all()
    return list(rows)


async def get_owned(db: AsyncSession, *, list_id: int, user_id: int) -> LeadList | None:
    ll = await db.get(LeadList, list_id)
    if ll is None or ll.user_id != user_id:
        return None
    return ll


async def update_list(
    db: AsyncSession,
    *,
    list_id: int,
    user_id: int,
    name: str | None,
    description: str | None,
) -> LeadList | None:
    ll = await get_owned(db, list_id=list_id, user_id=user_id)
    if ll is None:
        return None
    if name is not None:
        ll.name = name.strip()
    if description is not None:
        ll.description = description
    ll.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(ll)
    return ll


async def delete_list(db: AsyncSession, *, list_id: int, user_id: int) -> bool:
    ll = await get_owned(db, list_id=list_id, user_id=user_id)
    if ll is None:
        return False
    await db.delete(ll)
    await db.commit()
    return True


# ---------------------------------------------------------------------------
# Items
# ---------------------------------------------------------------------------


async def list_items_with_companies(
    db: AsyncSession,
    *,
    list_id: int,
    limit: int = 200,
    offset: int = 0,
) -> list[Company]:
    rows = (
        await db.execute(
            select(Company)
            .join(LeadListItem, LeadListItem.company_id == Company.id)
            .where(LeadListItem.lead_list_id == list_id)
            .order_by(LeadListItem.added_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()
    return list(rows)


async def add_companies(
    db: AsyncSession,
    *,
    list_id: int,
    company_ids: list[int],
) -> dict[str, int]:
    """Добавляет компании в список. Возвращает {added, already_in_list, not_found, items_count}."""
    if not company_ids:
        return {"added": 0, "already_in_list": 0, "not_found": 0, "items_count": 0}
    company_ids = list({int(cid) for cid in company_ids})

    # Сколько из этих компаний реально существует
    existing_rows = (
        await db.execute(
            select(Company.id).where(Company.id.in_(company_ids))
        )
    ).scalars().all()
    existing_ids = {int(cid) for cid in existing_rows}
    not_found = len(company_ids) - len(existing_ids)

    # Какие уже в списке
    already_rows = (
        await db.execute(
            select(LeadListItem.company_id)
            .where(
                LeadListItem.lead_list_id == list_id,
                LeadListItem.company_id.in_(existing_ids),
            )
        )
    ).scalars().all()
    already_in = {int(cid) for cid in already_rows}

    to_insert = existing_ids - already_in
    for cid in to_insert:
        db.add(LeadListItem(lead_list_id=list_id, company_id=cid))
    await db.flush()

    # Обновляем кэш items_count
    total = (
        await db.execute(
            select(func.count())
            .select_from(LeadListItem)
            .where(LeadListItem.lead_list_id == list_id)
        )
    ).scalar_one() or 0
    await db.execute(
        update(LeadList)
        .where(LeadList.id == list_id)
        .values(items_count=int(total), updated_at=datetime.now(timezone.utc))
    )
    await db.commit()
    return {
        "added": len(to_insert),
        "already_in_list": len(already_in),
        "not_found": not_found,
        "items_count": int(total),
    }


async def remove_company(db: AsyncSession, *, list_id: int, company_id: int) -> bool:
    result = await db.execute(
        delete(LeadListItem).where(
            LeadListItem.lead_list_id == list_id,
            LeadListItem.company_id == company_id,
        )
    )
    if result.rowcount or 0:
        total = (
            await db.execute(
                select(func.count())
                .select_from(LeadListItem)
                .where(LeadListItem.lead_list_id == list_id)
            )
        ).scalar_one() or 0
        await db.execute(
            update(LeadList)
            .where(LeadList.id == list_id)
            .values(items_count=int(total), updated_at=datetime.now(timezone.utc))
        )
        await db.commit()
        return True
    return False


# ---------------------------------------------------------------------------
# Convert list -> EmailCampaign (фича 3.1)
# ---------------------------------------------------------------------------


def _personalize(template: str, *, mapping: dict[str, Any]) -> str:
    """Безопасная подстановка {name}, {city}, {top_pain}, {pain_quote}.

    Намеренно не используем str.format() — он падает на любой неизвестной
    переменной (например, если в шаблоне `{username}`). Делаем ручной replace
    только известных ключей.
    """
    out = template or ""
    for key, value in mapping.items():
        token = "{" + key + "}"
        out = out.replace(token, str(value or ""))
    return out


async def create_campaign_from_list(
    db: AsyncSession,
    *,
    user_id: int,
    organization_id: int | None,
    list_id: int,
    name: str,
    subject: str,
    body: str,
    template_id: int | None,
    domain_id: int | None,
    from_email: str | None,
    from_name: str | None,
    reply_to_email: str | None,
    auto_personalize: bool,
) -> dict[str, int]:
    """Создаёт draft EmailCampaign из списка лидов.

    Не отправляет сразу — пользователь делает это отдельным шагом через
    существующий outreach UI (там же он может пересмотреть subject/body).
    Кампания получает search_result_ids = [] и хранит company_ids в extra_data
    — не нагружаем существующую таблицу email_campaigns новым полем, а
    готовим EmailLog'и сами.

    Шаги:
      1. Берём компании списка (только с email > 0)
      2. Создаём EmailCampaign(status=draft)
      3. На каждую компанию создаём EmailLog (status=pending) с подставленными переменными
      4. total_recipients = N
    """
    # Подгружаем компании списка с топ-болями для персонализации
    items = (
        await db.execute(
            select(Company)
            .join(LeadListItem, LeadListItem.company_id == Company.id)
            .where(LeadListItem.lead_list_id == list_id)
        )
    ).scalars().all()
    items = list(items)
    if not items:
        return {"campaign_id": 0, "total_recipients": 0, "skipped_no_email": 0}

    from app.modules.maps.service import get_top_pains_for_companies

    top_pains_map: dict[int, list[dict[str, Any]]] = {}
    if auto_personalize:
        top_pains_map = await get_top_pains_for_companies(
            db, [c.id for c in items], limit_per_company=1
        )

    # Создаём кампанию
    campaign = EmailCampaign(
        user_id=user_id,
        organization_id=organization_id,
        template_id=template_id,
        domain_id=domain_id,
        name=name.strip(),
        subject=subject.strip(),
        body=body,
        status=CampaignStatus.DRAFT.value,
        from_email=from_email,
        from_name=from_name,
        reply_to_email=reply_to_email,
        search_result_ids=[],  # source — lead_lists, не searches
    )
    db.add(campaign)
    await db.flush()

    # Импорт здесь, не сверху — EmailLog подсоединяется через relationship
    from app.models.email import EmailLog, EmailStatus

    total = 0
    skipped = 0
    for company in items:
        emails = company.emails if isinstance(company.emails, list) else []
        if not emails:
            skipped += 1
            continue
        to_email = emails[0]  # один primary email на компанию
        top_pain = top_pains_map.get(company.id, [{}])[0] if top_pains_map.get(company.id) else {}

        mapping = {
            "name": company.name or "",
            "company_name": company.name or "",
            "city": company.city or "",
            "niche": company.niche or "",
            "top_pain": (top_pain.get("label") or "") if isinstance(top_pain, dict) else "",
            "pain_quote": (top_pain.get("top_quote") or "") if isinstance(top_pain, dict) else "",
        }
        rendered_subject = _personalize(subject, mapping=mapping) if auto_personalize else subject
        rendered_body = _personalize(body, mapping=mapping) if auto_personalize else body

        log = EmailLog(
            campaign_id=campaign.id,
            user_id=user_id,
            organization_id=organization_id,
            to_email=to_email,
            to_name=company.name,
            subject=rendered_subject[:500],
            body_preview=rendered_body[:500],
            status=EmailStatus.PENDING.value,
        )
        db.add(log)
        total += 1

    campaign.total_recipients = total
    await db.commit()
    await db.refresh(campaign)
    return {
        "campaign_id": int(campaign.id),
        "total_recipients": total,
        "skipped_no_email": skipped,
    }
