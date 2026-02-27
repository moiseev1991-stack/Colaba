"""
Searches module router.
"""

import csv
import io
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from typing import List, Optional

from app.core.dependencies import (
    get_db,
    get_current_user_id,
    get_current_organization_id,
)
from app.modules.searches import schemas, service

router = APIRouter(prefix="/searches", tags=["searches"])


@router.post("", response_model=schemas.SearchResponse, status_code=status.HTTP_201_CREATED)
async def create_search(
    search_data: schemas.SearchCreate,
    user_id: int = Depends(get_current_user_id),
    organization_id: Optional[int] = Depends(get_current_organization_id),
    db=Depends(get_db),
):
    """
    Create a new search.
    
    Regular users: organization_id is automatically set from their organization.
    Superusers: can create searches without organization_id (global searches) or specify organization_id.
    """
    # For superusers: if organization_id is None, allow creating global searches
    # If organization_id is specified in request, use it
    if organization_id is None:
        # Superuser can use organization_id from request body, or create global search (None)
        organization_id = search_data.organization_id
        # If still None, superuser creates a global search (organization_id = None is allowed)
    
    return await service.create_search(
        db=db,
        user_id=user_id,
        organization_id=organization_id,
        search_data=search_data
    )


@router.get("", response_model=List[schemas.SearchResponse])
async def list_searches(
    limit: int = Query(default=50, ge=1, le=500, description="Number of results per page"),
    offset: int = Query(default=0, ge=0, description="Offset for pagination"),
    period: Optional[str] = Query(default=None, description="Filter by period: day, week, month"),
    user_id: int = Depends(get_current_user_id),
    organization_id: Optional[int] = Depends(get_current_organization_id),
    db=Depends(get_db),
):
    """List searches for the current user's organization with optional period and pagination."""
    created_after: Optional[datetime] = None
    if period == "day":
        created_after = datetime.now(timezone.utc) - timedelta(days=1)
    elif period == "week":
        created_after = datetime.now(timezone.utc) - timedelta(weeks=1)
    elif period == "month":
        created_after = datetime.now(timezone.utc) - timedelta(days=30)

    return await service.get_searches(
        db=db,
        user_id=user_id,
        organization_id=organization_id,
        limit=limit,
        offset=offset,
        created_after=created_after,
    )


@router.get("/{search_id}", response_model=schemas.SearchResponse)
async def get_search(
    search_id: int,
    user_id: int = Depends(get_current_user_id),
    organization_id: Optional[int] = Depends(get_current_organization_id),
    db=Depends(get_db),
):
    """
    Get a specific search by ID.
    
    Regular users can only access searches from their organization.
    Superusers can access any search.
    """
    search = await service.get_search(
        db=db,
        search_id=search_id,
        user_id=user_id,
        organization_id=organization_id
    )
    if not search:
        raise HTTPException(status_code=404, detail="Search not found")
    return search


@router.get("/{search_id}/results", response_model=List[schemas.SearchResultResponse])
async def get_search_results(
    search_id: int,
    limit: int = Query(default=200, ge=1, le=1000, description="Number of results per page"),
    offset: int = Query(default=0, ge=0, description="Offset for pagination"),
    user_id: int = Depends(get_current_user_id),
    organization_id: Optional[int] = Depends(get_current_organization_id),
    db=Depends(get_db),
):
    """Get results for a specific search with optional pagination."""
    results = await service.get_search_results(
        db=db,
        search_id=search_id,
        user_id=user_id,
        organization_id=organization_id,
        limit=limit,
        offset=offset,
    )
    return results


@router.delete("/{search_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_search(
    search_id: int,
    user_id: int = Depends(get_current_user_id),
    organization_id: Optional[int] = Depends(get_current_organization_id),
    db=Depends(get_db),
):
    """Delete a search."""
    await service.delete_search(
        db=db,
        search_id=search_id,
        user_id=user_id,
        organization_id=organization_id
    )


@router.get("/{search_id}/results/export/csv")
async def export_search_results_csv(
    search_id: int,
    user_id: int = Depends(get_current_user_id),
    organization_id: Optional[int] = Depends(get_current_organization_id),
    db=Depends(get_db),
):
    """Export search results as CSV file."""
    results = await service.get_search_results(
        db=db,
        search_id=search_id,
        user_id=user_id,
        organization_id=organization_id,
        limit=10000,
        offset=0,
    )

    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_ALL)
    writer.writerow([
        "position", "domain", "url", "title", "phone", "email",
        "seo_score", "contact_status", "outreach_subject", "outreach_text", "snippet",
    ])
    for r in results:
        writer.writerow([
            r.position, r.domain or "", r.url, r.title,
            r.phone or "", r.email or "",
            r.seo_score if r.seo_score is not None else "",
            r.contact_status or "",
            r.outreach_subject or "", r.outreach_text or "",
            r.snippet or "",
        ])

    output.seek(0)
    filename = f"search_{search_id}_results.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/{search_id}/results/{result_id}/audit",
    response_model=schemas.SearchResultResponse,
)
async def run_result_audit(
    search_id: int,
    result_id: int,
    user_id: int = Depends(get_current_user_id),
    organization_id: Optional[int] = Depends(get_current_organization_id),
    db=Depends(get_db),
):
    """Run SEO audit for one search result; merge into extra_data.audit, set seo_score."""
    out = await service.run_result_audit(
        db=db,
        search_id=search_id,
        result_id=result_id,
        user_id=user_id,
        organization_id=organization_id,
    )
    if not out:
        raise HTTPException(status_code=404, detail="Search or result not found")
    return out


@router.get("/{search_id}/results/grouped", response_model=schemas.SearchResultsGroupedResponse)
async def get_search_results_grouped(
    search_id: int,
    user_id: int = Depends(get_current_user_id),
    organization_id: Optional[int] = Depends(get_current_organization_id),
    db=Depends(get_db),
):
    """
    Get search results grouped by domain.
    
    Regular users can only access results from their organization's searches.
    Superusers can access any search results.
    """
    grouped = await service.get_search_results_grouped_by_domain(
        db=db,
        search_id=search_id,
        user_id=user_id,
        organization_id=organization_id
    )
    return grouped
