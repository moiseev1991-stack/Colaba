"""
Deployment service.
"""

from typing import Optional, List, Tuple
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.deployment import Deployment, DeploymentEnvironment, DeploymentStatus
from app.modules.deployments.schemas import DeploymentCreate


async def create_deployment(db: AsyncSession, deployment_data: DeploymentCreate) -> Deployment:
    """Create a new deployment record."""
    deployment = Deployment(
        version=deployment_data.version,
        git_sha=deployment_data.git_sha,
        environment=DeploymentEnvironment(deployment_data.environment),
        changelog=deployment_data.changelog,
        deployed_by=deployment_data.deployed_by,
        status=DeploymentStatus(deployment_data.status),
    )
    db.add(deployment)
    await db.commit()
    await db.refresh(deployment)
    return deployment


async def get_deployments(
    db: AsyncSession,
    environment: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
) -> Tuple[List[Deployment], int]:
    """Get list of deployments with optional filtering."""
    query = select(Deployment)

    if environment:
        query = query.where(Deployment.environment == DeploymentEnvironment(environment))

    query = query.order_by(desc(Deployment.deployed_at))

    # Get total count
    count_query = select(func.count()).select_from(Deployment)
    if environment:
        count_query = count_query.where(Deployment.environment == DeploymentEnvironment(environment))
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0

    # Get paginated results
    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    deployments = list(result.scalars().all())

    return deployments, total


async def get_latest_deployment(db: AsyncSession, environment: str = "production") -> Optional[Deployment]:
    """Get the latest deployment for an environment."""
    query = (
        select(Deployment)
        .where(Deployment.environment == DeploymentEnvironment(environment))
        .where(Deployment.status == DeploymentStatus.SUCCESS)
        .order_by(desc(Deployment.deployed_at))
        .limit(1)
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()
