"""
Searches module router.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List

from app.core.dependencies import get_db, get_optional_user_id
from app.modules.searches import schemas, service

router = APIRouter(prefix="/searches", tags=["searches"])


@router.post("", response_model=schemas.SearchResponse, status_code=status.HTTP_201_CREATED)
async def create_search(
    search_data: schemas.SearchCreate,
    user_id: int = Depends(get_optional_user_id),
    db=Depends(get_db),
):
    """Create a new search."""
    # For MVP: use default user_id if not authenticated
    if not user_id:
        user_id = 1
    return await service.create_search(db=db, user_id=user_id, search_data=search_data)


@router.get("", response_model=List[schemas.SearchResponse])
async def list_searches(
    user_id: int = Depends(get_optional_user_id),
    db=Depends(get_db),
):
    """List all searches for the current user."""
    # For MVP: use default user_id if not authenticated
    if not user_id:
        user_id = 1
    return await service.get_searches(db=db, user_id=user_id)


@router.get("/{search_id}", response_model=schemas.SearchResponse)
async def get_search(
    search_id: int,
    user_id: int = Depends(get_optional_user_id),
    db=Depends(get_db),
):
    """Get a specific search by ID."""
    # For MVP: use default user_id if not authenticated
    if not user_id:
        user_id = 1
    search = await service.get_search(db=db, search_id=search_id, user_id=user_id)
    if not search:
        raise HTTPException(status_code=404, detail="Search not found")
    return search


@router.get("/{search_id}/results", response_model=List[schemas.SearchResultResponse])
async def get_search_results(
    search_id: int,
    user_id: int = Depends(get_optional_user_id),
    db=Depends(get_db),
):
    """Get results for a specific search."""
    # For MVP: use default user_id if not authenticated
    if not user_id:
        user_id = 1
    results = await service.get_search_results(db=db, search_id=search_id, user_id=user_id)
    return results


@router.delete("/{search_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_search(
    search_id: int,
    user_id: int = Depends(get_optional_user_id),
    db=Depends(get_db),
):
    """Delete a search."""
    # For MVP: use default user_id if not authenticated
    if not user_id:
        user_id = 1
    await service.delete_search(db=db, search_id=search_id, user_id=user_id)


@router.get("/{search_id}/results/grouped", response_model=schemas.SearchResultsGroupedResponse)
async def get_search_results_grouped(
    search_id: int,
    user_id: int = Depends(get_optional_user_id),
    db=Depends(get_db),
):
    """Get search results grouped by domain."""
    # For MVP: use default user_id if not authenticated
    if not user_id:
        user_id = 1
    grouped = await service.get_search_results_grouped_by_domain(
        db=db, search_id=search_id, user_id=user_id
    )
    return grouped
