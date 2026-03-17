"""
Deployment schemas.
"""

from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class DeploymentBase(BaseModel):
    """Base deployment schema."""
    version: str
    git_sha: str
    environment: str
    changelog: Optional[str] = None
    deployed_by: Optional[str] = None
    status: str = "success"


class DeploymentCreate(DeploymentBase):
    """Schema for creating a deployment record."""
    pass


class DeploymentResponse(DeploymentBase):
    """Schema for deployment response."""
    id: int
    deployed_at: datetime

    class Config:
        from_attributes = True


class DeploymentList(BaseModel):
    """Schema for list of deployments."""
    items: list[DeploymentResponse]
    total: int
