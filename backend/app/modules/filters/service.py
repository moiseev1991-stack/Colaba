"""
Filters module service.
"""

from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.filter import Filter, BlacklistDomain
from app.modules.filters import schemas


async def create_seo_filter(
    db: AsyncSession,
    user_id: int,
    filter_data: schemas.SEOFilterCreate,
) -> schemas.SEOFilterResponse:
    """Create a new SEO filter."""
    filter_obj = Filter(
        user_id=user_id,
        name=filter_data.name,
        filter_type="seo",
        config=filter_data.config,
    )
    db.add(filter_obj)
    await db.commit()
    await db.refresh(filter_obj)
    return schemas.SEOFilterResponse.model_validate(filter_obj)


async def create_blacklist_domain(
    db: AsyncSession,
    user_id: int,
    domain_data: schemas.BlacklistDomainCreate,
) -> schemas.BlacklistDomainResponse:
    """Add a domain to blacklist."""
    domain = BlacklistDomain(
        user_id=user_id,
        domain=domain_data.domain,
    )
    db.add(domain)
    await db.commit()
    await db.refresh(domain)
    return schemas.BlacklistDomainResponse.model_validate(domain)


async def run_seo_audit(
    db: AsyncSession,
    user_id: int,
    audit_request: schemas.SEOAuditRequest,
) -> schemas.SEOAuditResult:
    """Run SEO audit for a URL."""
    from app.modules.filters.seo_audit import audit_url
    
    result = await audit_url(audit_request.url)
    
    return schemas.SEOAuditResult(
        url=result["url"],
        score=result["score"],
        issues=result["issues"],
        details=result.get("details", {}),
    )
