"""HTTP endpoints для website_leads.

  POST   /api/v1/website-leads/submit  — публичный, без auth, rate-limit
  GET    /api/v1/website-leads         — список (только is_superuser)
  PATCH  /api/v1/website-leads/{id}    — смена статуса (admin)
  DELETE /api/v1/website-leads/{id}    — soft-delete (admin)
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, require_superuser
from app.core.rate_limit import get_client_ip, limiter
from app.modules.website_leads import schemas, service

router = APIRouter(prefix="/website-leads", tags=["website-leads"])


@router.post(
    "/submit",
    response_model=schemas.WebsiteLeadSubmitResponse,
    status_code=status.HTTP_200_OK,
)
@limiter.limit("5/hour")
async def submit_lead(
    request: Request,
    payload: schemas.WebsiteLeadSubmit,
    db: AsyncSession = Depends(get_db),
):
    """Публичный приём заявки с landing-страниц.

    Без auth. Rate-limit: 5 заявок в час с одного IP — этого хватит
    реальному юзеру и отсечёт массовых ботов. Honeypot-поле `_hp`
    скрыто в форме и должно оставаться пустым.
    """
    client_ip = get_client_ip(request)
    user_agent = request.headers.get("user-agent", "")
    return await service.submit_lead(
        db,
        payload,
        client_ip=client_ip,
        user_agent=user_agent,
    )


@router.get("", response_model=schemas.WebsiteLeadListResponse)
async def list_leads(
    status_filter: Optional[str] = None,
    include_deleted: bool = False,
    limit: int = 100,
    offset: int = 0,
    _: object = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    items, total = await service.list_leads(
        db,
        status_filter=status_filter,
        include_deleted=include_deleted,
        limit=limit,
        offset=offset,
    )
    return schemas.WebsiteLeadListResponse(
        items=[schemas.WebsiteLeadOut.model_validate(i) for i in items],
        total=total,
    )


@router.patch("/{lead_id}", response_model=schemas.WebsiteLeadOut)
async def patch_status(
    lead_id: int,
    payload: schemas.WebsiteLeadStatusUpdate,
    _: object = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    lead = await service.update_status(db, lead_id, payload.status)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return schemas.WebsiteLeadOut.model_validate(lead)


@router.delete("/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lead(
    lead_id: int,
    _: object = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    ok = await service.soft_delete(db, lead_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Lead not found")
    return None
