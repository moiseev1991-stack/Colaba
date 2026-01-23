"""
Searches module router.
"""

from fastapi import APIRouter, Depends, HTTPException, status
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
    user_id: int = Depends(get_current_user_id),
    organization_id: Optional[int] = Depends(get_current_organization_id),
    db=Depends(get_db),
):
    """List all searches for the current user's organization."""
    return await service.get_searches(
        db=db,
        user_id=user_id,
        organization_id=organization_id
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
    user_id: int = Depends(get_current_user_id),
    organization_id: Optional[int] = Depends(get_current_organization_id),
    db=Depends(get_db),
):
    """Get results for a specific search."""
    results = await service.get_search_results(
        db=db,
        search_id=search_id,
        user_id=user_id,
        organization_id=organization_id
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
