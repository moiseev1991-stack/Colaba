"""HTTP API модуля lead_lists. Префикс /lead-lists."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.rate_limit import limiter
from app.modules.lead_lists import service
from app.modules.lead_lists.schemas import (
    BulkDraftItem,
    BulkDraftsOut,
    CreateCampaignFromListIn,
    CreateCampaignFromListOut,
    LeadListCreate,
    LeadListDetailOut,
    LeadListItemsAddIn,
    LeadListItemsAddOut,
    LeadListOut,
    LeadListUpdate,
)
from app.modules.maps.schemas import CompanyOut, CompanyPainOut
from app.modules.maps import service as maps_service


def _to_detail(ll, items: list[CompanyOut]) -> LeadListDetailOut:
    """LeadListDetailOut.model_validate(ll) пытается auto-fill items из
    ll.items, а это relationship с lazy='raise' — бросает в async-контексте.
    Поэтому собираем DetailOut руками поверх LeadListOut.
    """
    base = LeadListOut.model_validate(ll)
    return LeadListDetailOut(**base.model_dump(), items=items)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lead-lists", tags=["lead-lists"])


@router.get("", response_model=list[LeadListOut])
@limiter.limit("60/minute")
async def list_my_lists(
    request: Request,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    rows = await service.list_for_user(db, user_id=user_id)
    return [LeadListOut.model_validate(r) for r in rows]


@router.post("", response_model=LeadListOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
async def create_list(
    request: Request,
    payload: LeadListCreate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    ll = await service.create_list(
        db,
        user_id=user_id,
        name=payload.name,
        description=payload.description,
        source=payload.source,
    )
    return LeadListOut.model_validate(ll)


@router.get("/{list_id}", response_model=LeadListDetailOut)
@limiter.limit("60/minute")
async def get_list(
    request: Request,
    list_id: int,
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    ll = await service.get_owned(db, list_id=list_id, user_id=user_id)
    if ll is None:
        raise HTTPException(status_code=404, detail="Lead list not found")
    items = await service.list_items_with_companies(db, list_id=list_id, limit=limit, offset=offset)
    pains_map = await maps_service.get_top_pains_for_companies(db, [c.id for c in items], limit_per_company=3)
    out_items: list[CompanyOut] = []
    for c in items:
        out = CompanyOut.model_validate(c)
        out.top_pains = [CompanyPainOut(**p) for p in pains_map.get(c.id, [])]
        out_items.append(out)
    return _to_detail(ll, out_items)


@router.patch("/{list_id}", response_model=LeadListOut)
@limiter.limit("30/minute")
async def update_list(
    request: Request,
    list_id: int,
    payload: LeadListUpdate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    ll = await service.update_list(
        db,
        list_id=list_id,
        user_id=user_id,
        name=payload.name,
        description=payload.description,
    )
    if ll is None:
        raise HTTPException(status_code=404, detail="Lead list not found")
    return LeadListOut.model_validate(ll)


@router.delete("/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def delete_list(
    request: Request,
    list_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    ok = await service.delete_list(db, list_id=list_id, user_id=user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Lead list not found")


@router.post("/{list_id}/items", response_model=LeadListItemsAddOut)
@limiter.limit("60/minute")
async def add_items(
    request: Request,
    list_id: int,
    payload: LeadListItemsAddIn,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    ll = await service.get_owned(db, list_id=list_id, user_id=user_id)
    if ll is None:
        raise HTTPException(status_code=404, detail="Lead list not found")
    return LeadListItemsAddOut(**await service.add_companies(db, list_id=list_id, company_ids=payload.company_ids))


@router.delete("/{list_id}/items/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("60/minute")
async def remove_item(
    request: Request,
    list_id: int,
    company_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    ll = await service.get_owned(db, list_id=list_id, user_id=user_id)
    if ll is None:
        raise HTTPException(status_code=404, detail="Lead list not found")
    ok = await service.remove_company(db, list_id=list_id, company_id=company_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Item not found in list")


@router.post("/{list_id}/bulk-drafts", response_model=BulkDraftsOut)
@limiter.limit("3/minute")
async def bulk_draft_emails(
    request: Request,
    list_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """LLM-генерация драфтов писем для всех компаний списка параллельно.

    Для каждой компании с pain_tags+цитатами берётся топ-1 боль и идёт в
    промпт. Параллельность ограничена asyncio.Semaphore(5), чтобы не задушить
    ProxyAPI. Типичное время: ~10-30с на список из 25 компаний.

    Возвращает массив драфтов + счётчики компаний, у которых драфт не вышел
    (no_pains / llm_error). UI показывает это пачкой, юзер может пройтись
    глазами и скопировать каждый.
    """
    import asyncio

    ll = await service.get_owned(db, list_id=list_id, user_id=user_id)
    if ll is None:
        raise HTTPException(status_code=404, detail="Lead list not found")
    items = await service.list_items_with_companies(db, list_id=list_id, limit=200)
    if not items:
        return BulkDraftsOut(list_id=list_id, total_companies=0)

    pains_map = await maps_service.get_top_pains_for_companies(
        db, [c.id for c in items], limit_per_company=2,
    )

    from app.modules.reviews_ai.llm import call_llm_outreach_draft

    sem = asyncio.Semaphore(5)
    skipped_no_pains = 0
    skipped_llm_error = 0
    drafts: list[BulkDraftItem] = []
    lock = asyncio.Lock()

    async def gen_for(company) -> None:
        nonlocal skipped_no_pains, skipped_llm_error
        pains = pains_map.get(company.id, [])
        pains_with_quote = [p for p in pains if p.get("top_quote")]
        if not pains_with_quote:
            async with lock:
                skipped_no_pains += 1
            return
        async with sem:
            draft = await call_llm_outreach_draft(
                db,
                company_name=company.name or "",
                niche=company.niche or "",
                city=company.city or "",
                source=company.source or "карты",
                pains=[
                    {"label": p["label"], "quote": p.get("top_quote") or ""}
                    for p in pains_with_quote
                ],
            )
        if draft is None:
            async with lock:
                skipped_llm_error += 1
            return
        emails = company.emails if isinstance(company.emails, list) else []
        top_p = pains_with_quote[0]
        async with lock:
            drafts.append(BulkDraftItem(
                company_id=company.id,
                company_name=company.name or "",
                subject=draft["subject"],
                body=draft["body"],
                used_pain_label=top_p.get("label"),
                used_pain_quote=top_p.get("top_quote"),
                suggested_to_emails=list(emails)[:3],
            ))

    await asyncio.gather(*(gen_for(c) for c in items), return_exceptions=True)

    return BulkDraftsOut(
        list_id=list_id,
        total_companies=len(items),
        drafts=drafts,
        skipped_no_pains=skipped_no_pains,
        skipped_llm_error=skipped_llm_error,
    )


@router.post("/{list_id}/create-campaign", response_model=CreateCampaignFromListOut)
@limiter.limit("10/minute")
async def create_campaign(
    request: Request,
    list_id: int,
    payload: CreateCampaignFromListIn,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Конвертирует список лидов в draft EmailCampaign.

    Подставляет {company_name}, {city}, {niche}, {top_pain}, {pain_quote} если
    `auto_personalize` (по умолчанию True). Компании без emails — пропускаются
    с инкрементом `skipped_no_email`.

    Дальше пользователь идёт в обычный outreach-UI запускать рассылку.
    """
    ll = await service.get_owned(db, list_id=list_id, user_id=user_id)
    if ll is None:
        raise HTTPException(status_code=404, detail="Lead list not found")
    result = await service.create_campaign_from_list(
        db,
        user_id=user_id,
        organization_id=ll.organization_id,
        list_id=list_id,
        name=payload.name,
        subject=payload.subject,
        body=payload.body,
        template_id=payload.template_id,
        domain_id=payload.domain_id,
        from_email=payload.from_email,
        from_name=payload.from_name,
        reply_to_email=payload.reply_to_email,
        auto_personalize=payload.auto_personalize,
    )
    if result["campaign_id"] == 0:
        raise HTTPException(
            status_code=409,
            detail="Список пуст — нельзя создать кампанию без получателей.",
        )
    return CreateCampaignFromListOut(**result)
