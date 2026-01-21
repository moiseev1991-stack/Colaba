"""
Filters module router.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_db, get_optional_user_id
from app.modules.filters import schemas, service

router = APIRouter(prefix="/filters", tags=["filters"])


@router.post("/seo", response_model=schemas.SEOFilterResponse, status_code=status.HTTP_201_CREATED)
async def create_seo_filter(
    filter_data: schemas.SEOFilterCreate,
    user_id: int = Depends(get_optional_user_id),
    db=Depends(get_db),
):
    """Create a new SEO filter."""
    # For MVP: use default user_id if not authenticated
    if not user_id:
        user_id = 1
    return await service.create_seo_filter(db=db, user_id=user_id, filter_data=filter_data)


@router.post("/blacklist", response_model=schemas.BlacklistDomainResponse, status_code=status.HTTP_201_CREATED)
async def create_blacklist_domain(
    domain_data: schemas.BlacklistDomainCreate,
    user_id: int = Depends(get_optional_user_id),
    db=Depends(get_db),
):
    """Add a domain to blacklist."""
    # For MVP: use default user_id if not authenticated
    if not user_id:
        user_id = 1
    return await service.create_blacklist_domain(db=db, user_id=user_id, domain_data=domain_data)


@router.post("/audit", response_model=schemas.SEOAuditResult)
async def run_seo_audit(
    audit_request: schemas.SEOAuditRequest,
    user_id: int = Depends(get_optional_user_id),
    db=Depends(get_db),
):
    """Run SEO audit for a URL."""
    # For MVP: use default user_id if not authenticated
    if not user_id:
        user_id = 1
    return await service.run_seo_audit(db=db, user_id=user_id, audit_request=audit_request)
