"""
Searches module service.
"""

from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.search import Search, SearchResult
from app.modules.searches import schemas


async def create_search(
    db: AsyncSession,
    user_id: int,
    organization_id: Optional[int],
    search_data: schemas.SearchCreate,
) -> schemas.SearchResponse:
    """Create a new search and trigger background task."""
    from app.queue.tasks import execute_search_task
    
    search = Search(
        user_id=user_id,
        organization_id=organization_id,
        query=search_data.query,
        search_provider=search_data.search_provider,
        num_results=search_data.num_results,
        status="pending",
        config=search_data.config or {},
    )
    db.add(search)
    await db.commit()
    await db.refresh(search)
    
    # Trigger background task (only if Celery is available)
    try:
        from app.queue.tasks import execute_search_task
        execute_search_task.delay(search.id)
    except Exception as e:
        # If Celery is not available, log error but don't fail
        import logging
        logging.warning(f"Failed to trigger Celery task: {e}")
    
    return schemas.SearchResponse.model_validate(search)


async def get_searches(
    db: AsyncSession,
    user_id: int,
    organization_id: Optional[int],
) -> List[schemas.SearchResponse]:
    """
    Get all searches for a user in their organization.
    
    If organization_id is None (superuser), returns all searches.
    """
    query = select(Search)
    
    # Superusers can see all searches
    if organization_id is not None:
        query = query.where(Search.organization_id == organization_id)
    
    result = await db.execute(query.order_by(Search.created_at.desc()))
    searches = result.scalars().all()
    return [schemas.SearchResponse.model_validate(s) for s in searches]


async def get_search(
    db: AsyncSession,
    search_id: int,
    user_id: int,
    organization_id: int,
) -> Optional[schemas.SearchResponse]:
    """Get a specific search."""
    result = await db.execute(
        select(Search).where(
            Search.id == search_id,
            Search.organization_id == organization_id
        )
    )
    search = result.scalar_one_or_none()
    if not search:
        return None
    return schemas.SearchResponse.model_validate(search)


async def get_search_results(
    db: AsyncSession,
    search_id: int,
    user_id: int,
    organization_id: Optional[int],
) -> List[schemas.SearchResultResponse]:
    """Get results for a search."""
    # Verify search belongs to organization (or user is superuser)
    search = await get_search(db, search_id, user_id, organization_id)
    if not search:
        return []
    
    result = await db.execute(
        select(SearchResult)
        .where(SearchResult.search_id == search_id)
        .order_by(SearchResult.position)
    )
    results = result.scalars().all()
    return [schemas.SearchResultResponse.model_validate(r) for r in results]


async def delete_search(
    db: AsyncSession,
    search_id: int,
    user_id: int,
    organization_id: int,
) -> None:
    """Delete a search."""
    result = await db.execute(
        select(Search).where(
            Search.id == search_id,
            Search.organization_id == organization_id
        )
    )
    search = result.scalar_one_or_none()
    if search:
        await db.delete(search)
        await db.commit()


async def get_search_results_grouped_by_domain(
    db: AsyncSession,
    search_id: int,
    user_id: int,
    organization_id: Optional[int],
) -> schemas.SearchResultsGroupedResponse:
    """Get search results grouped by domain."""
    # Verify search belongs to organization (or user is superuser)
    search = await get_search(db, search_id, user_id, organization_id)
    if not search:
        return schemas.SearchResultsGroupedResponse(
            domains=[],
            total_results=0,
            unique_domains=0,
        )
    
    # Get all results
    result = await db.execute(
        select(SearchResult)
        .where(SearchResult.search_id == search_id)
        .order_by(SearchResult.position)
    )
    all_results = result.scalars().all()
    
    # Group by domain
    domains_dict: Dict[str, List[schemas.SearchResultResponse]] = {}
    for r in all_results:
        domain = r.domain or "unknown"
        if domain not in domains_dict:
            domains_dict[domain] = []
        domains_dict[domain].append(schemas.SearchResultResponse.model_validate(r))
    
    # Convert to list with domain info
    domains_list = []
    for domain, results in domains_dict.items():
        # Get first result for domain info
        first_result = results[0]
        domain_group = schemas.DomainGroupResponse(
            domain=domain,
            results_count=len(results),
            seo_score=first_result.seo_score,
            phone=first_result.phone,
            email=first_result.email,
            contact_status=first_result.contact_status,
            results=results,
        )
        domains_list.append(domain_group)
    
    # Sort by results count (descending)
    domains_list.sort(key=lambda x: x.results_count, reverse=True)
    
    return schemas.SearchResultsGroupedResponse(
        domains=domains_list,
        total_results=len(all_results),
        unique_domains=len(domains_list),
    )
