"""
Filters module schemas.
"""

from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class SEOFilterCreate(BaseModel):
    """Schema for creating SEO filter."""
    name: str = Field(..., min_length=1, max_length=200)
    config: Dict[str, Any] = Field(default_factory=dict)


class SEOFilterResponse(BaseModel):
    """Schema for SEO filter response."""
    id: int
    name: str
    config: Dict[str, Any]
    created_at: datetime

    class Config:
        from_attributes = True


class BlacklistDomainCreate(BaseModel):
    """Schema for creating blacklist domain."""
    domain: str = Field(..., min_length=1, max_length=255)


class BlacklistDomainResponse(BaseModel):
    """Schema for blacklist domain response."""
    id: int
    domain: str
    created_at: datetime

    class Config:
        from_attributes = True


class SEOAuditRequest(BaseModel):
    """Schema for SEO audit request."""
    url: str = Field(..., min_length=1)
    config: Optional[Dict[str, Any]] = None


class SEOAuditResult(BaseModel):
    """Schema for SEO audit result."""
    url: str
    score: int = Field(..., ge=0, le=100)
    issues: list[str] = Field(default_factory=list)
    details: Dict[str, Any] = Field(default_factory=dict)
