"""
Searches module schemas.
"""

from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field


class SearchCreate(BaseModel):
    """Schema for creating a search."""
    query: str = Field(..., min_length=1, max_length=500, description="Search query")
    search_provider: str = Field(default="serpapi", description="Search provider")
    num_results: int = Field(default=50, ge=1, le=100, description="Number of results")
    config: Optional[Dict[str, Any]] = Field(default=None, description="Additional config")


class SearchUpdate(BaseModel):
    """Schema for updating a search."""
    status: Optional[str] = None
    config: Optional[Dict[str, Any]] = None


class SearchResultResponse(BaseModel):
    """Schema for search result response."""
    id: int
    search_id: int
    position: int
    title: str
    url: str
    snippet: Optional[str] = None
    domain: Optional[str] = None
    seo_score: Optional[int] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    contact_status: Optional[str] = None
    outreach_subject: Optional[str] = None
    outreach_text: Optional[str] = None
    extra_data: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SearchResponse(BaseModel):
    """Schema for search response."""
    id: int
    query: str
    status: str
    search_provider: str
    num_results: int
    result_count: int = 0
    config: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DomainGroupResponse(BaseModel):
    """Schema for domain group response."""
    domain: str
    results_count: int
    seo_score: Optional[int] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    contact_status: Optional[str] = None
    results: List[SearchResultResponse]
    
    class Config:
        from_attributes = True


class SearchResultsGroupedResponse(BaseModel):
    """Schema for grouped search results response."""
    domains: List[DomainGroupResponse]
    total_results: int
    unique_domains: int
