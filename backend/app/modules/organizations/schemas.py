"""
Organizations module schemas.
"""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field

from app.models.organization import OrganizationRole


class OrganizationCreate(BaseModel):
    """Schema for creating an organization."""
    name: str = Field(..., min_length=1, max_length=255, description="Organization name")


class OrganizationUpdate(BaseModel):
    """Schema for updating an organization."""
    name: Optional[str] = Field(None, min_length=1, max_length=255, description="Organization name")


class OrganizationResponse(BaseModel):
    """Schema for organization response."""
    id: int
    name: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserOrganizationResponse(BaseModel):
    """Schema for user-organization relationship."""
    user_id: int
    organization_id: int
    role: OrganizationRole
    created_at: datetime

    class Config:
        from_attributes = True


class OrganizationWithUsersResponse(BaseModel):
    """Schema for organization with users."""
    id: int
    name: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    users_count: int = 0
    searches_count: int = 0

    class Config:
        from_attributes = True


class AddUserToOrganizationRequest(BaseModel):
    """Schema for adding user to organization."""
    user_id: int = Field(..., description="User ID to add")
    role: OrganizationRole = Field(default=OrganizationRole.MEMBER, description="User role in organization")


class UpdateUserRoleRequest(BaseModel):
    """Schema for updating user role in organization."""
    role: OrganizationRole = Field(..., description="New role for user")
