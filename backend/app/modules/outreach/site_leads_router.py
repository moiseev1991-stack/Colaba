"""Роутер /outreach/site-leads (Эпик F фокус-релиза «КП-конвейер»).

Эндпоинты:
  POST   /outreach/site-leads       — сохранить результат web-поиска
  GET    /outreach/site-leads       — список моих сохранённых сайтов
  GET    /outreach/site-leads/{id}  — один сайт
  DELETE /outreach/site-leads/{id}  — удалить

Логика поиска по сайтам остаётся в `modules/searches/`. Фронт вкладки
«Сайты» создаёт обычный Search, читает SearchResult-ы, и на клик
«в лиды» / «КП» дёргает POST сюда чтобы материализовать SiteLead под
дальнейшую генерацию КП.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.router import get_current_user_id
from app.modules.outreach import site_leads_service
from app.modules.outreach.kp_schemas import SiteLeadCreate, SiteLeadOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/site-leads", tags=["outreach-site-leads"])


@router.post("", response_model=SiteLeadOut, status_code=status.HTTP_201_CREATED)
async def create_site_lead(
    payload: SiteLeadCreate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> SiteLeadOut:
    """Сохранить результат web-поиска как лид. Идемпотентно — повторный
    POST с теми же url+entry возвращает существующую запись.
    """
    lead = await site_leads_service.create_site_lead(
        db,
        user_id=user_id,
        query=payload.query,
        entry=payload.entry,
        url=payload.url,
        title=payload.title,
        snippet=payload.snippet,
        search_id=payload.search_id,
    )
    return SiteLeadOut.model_validate(lead)


@router.get("", response_model=list[SiteLeadOut])
async def list_site_leads(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[SiteLeadOut]:
    leads = await site_leads_service.list_site_leads(db, user_id=user_id)
    return [SiteLeadOut.model_validate(l) for l in leads]


@router.get("/{lead_id}", response_model=SiteLeadOut)
async def get_site_lead(
    lead_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> SiteLeadOut:
    lead = await site_leads_service.get_site_lead(
        db, user_id=user_id, lead_id=lead_id
    )
    if lead is None:
        raise HTTPException(status_code=404, detail="Site-лид не найден.")
    return SiteLeadOut.model_validate(lead)


@router.delete("/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_site_lead(
    lead_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> None:
    ok = await site_leads_service.delete_site_lead(
        db, user_id=user_id, lead_id=lead_id
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Site-лид не найден.")
