"""
Deployment API router.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.models.deployment import Deployment
from app.modules.deployments import service
from app.modules.deployments.schemas import (
    DeploymentCreate,
    DeploymentResponse,
    DeploymentList,
)

router = APIRouter(prefix="/deployments", tags=["Deployments"])


@router.get("", response_model=DeploymentList)
async def list_deployments(
    environment: Optional[str] = Query(None, description="Filter by environment"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> DeploymentList:
    """Get list of deployments."""
    deployments, total = await service.get_deployments(
        db, environment=environment, limit=limit, offset=offset
    )
    return DeploymentList(
        items=[DeploymentResponse.model_validate(d) for d in deployments],
        total=total,
    )


@router.get("/latest", response_model=DeploymentResponse)
async def get_latest_deployment(
    environment: str = Query("production", description="Environment to check"),
    db: AsyncSession = Depends(get_db),
) -> DeploymentResponse:
    """Get the latest deployment for an environment."""
    deployment = await service.get_latest_deployment(db, environment)
    if not deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No deployments found",
        )
    return DeploymentResponse.model_validate(deployment)


@router.post("", response_model=DeploymentResponse, status_code=status.HTTP_201_CREATED)
async def create_deployment(
    deployment_data: DeploymentCreate,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> DeploymentResponse:
    """Create a new deployment record (requires authentication)."""
    deployment = await service.create_deployment(db, deployment_data)
    return DeploymentResponse.model_validate(deployment)


@router.get("/{deployment_id}", response_model=DeploymentResponse)
async def get_deployment(
    deployment_id: int,
    db: AsyncSession = Depends(get_db),
) -> DeploymentResponse:
    """Get a specific deployment by ID."""
    deployment = await db.get(Deployment, deployment_id)
    if not deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found",
        )
    return DeploymentResponse.model_validate(deployment)
