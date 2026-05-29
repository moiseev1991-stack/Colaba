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
    detail = LeadListDetailOut.model_validate(ll)
    out_items: list[CompanyOut] = []
    for c in items:
        out = CompanyOut.model_validate(c)
        out.top_pains = [CompanyPainOut(**p) for p in pains_map.get(c.id, [])]
        out_items.append(out)
    detail.items = out_items
    return detail


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
