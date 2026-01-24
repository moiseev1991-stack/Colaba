"""
Organizations module service.
"""

from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from fastapi import HTTPException, status

from app.models.organization import Organization, OrganizationRole, user_organizations
from app.models.user import User
from app.models.search import Search
from app.modules.organizations import schemas


async def create_organization(
    db: AsyncSession,
    org_data: schemas.OrganizationCreate,
) -> schemas.OrganizationResponse:
    """Create a new organization."""
    # Check if organization with this name already exists
    result = await db.execute(
        select(Organization).where(Organization.name == org_data.name)
    )
    existing_org = result.scalar_one_or_none()
    
    if existing_org:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization with this name already exists"
        )
    
    organization = Organization(name=org_data.name)
    db.add(organization)
    await db.commit()
    await db.refresh(organization)
    
    return schemas.OrganizationResponse.model_validate(organization)


async def get_organizations(
    db: AsyncSession,
) -> List[schemas.OrganizationWithUsersResponse]:
    """Get all organizations with statistics."""
    result = await db.execute(
        select(Organization).order_by(Organization.created_at.desc())
    )
    organizations = result.scalars().all()
    
    orgs_with_stats = []
    for org in organizations:
        # Count users
        users_count_result = await db.execute(
            select(func.count(user_organizations.c.user_id))
            .where(user_organizations.c.organization_id == org.id)
        )
        users_count = users_count_result.scalar_one() or 0
        
        # Count searches
        searches_count_result = await db.execute(
            select(func.count(Search.id))
            .where(Search.organization_id == org.id)
        )
        searches_count = searches_count_result.scalar_one() or 0
        
        org_data = schemas.OrganizationWithUsersResponse(
            id=org.id,
            name=org.name,
            created_at=org.created_at,
            updated_at=org.updated_at,
            users_count=users_count,
            searches_count=searches_count,
        )
        orgs_with_stats.append(org_data)
    
    return orgs_with_stats


async def get_organization(
    db: AsyncSession,
    organization_id: int,
) -> Optional[schemas.OrganizationResponse]:
    """Get a specific organization."""
    result = await db.execute(
        select(Organization).where(Organization.id == organization_id)
    )
    organization = result.scalar_one_or_none()
    if not organization:
        return None
    return schemas.OrganizationResponse.model_validate(organization)


async def update_organization(
    db: AsyncSession,
    organization_id: int,
    org_data: schemas.OrganizationUpdate,
) -> schemas.OrganizationResponse:
    """Update an organization."""
    result = await db.execute(
        select(Organization).where(Organization.id == organization_id)
    )
    organization = result.scalar_one_or_none()
    
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )
    
    if org_data.name is not None:
        # Check if name is already taken by another organization
        existing_result = await db.execute(
            select(Organization).where(
                Organization.name == org_data.name,
                Organization.id != organization_id
            )
        )
        if existing_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Organization with this name already exists"
            )
        organization.name = org_data.name
    
    await db.commit()
    await db.refresh(organization)
    
    return schemas.OrganizationResponse.model_validate(organization)


async def delete_organization(
    db: AsyncSession,
    organization_id: int,
) -> None:
    """Delete an organization."""
    result = await db.execute(
        select(Organization).where(Organization.id == organization_id)
    )
    organization = result.scalar_one_or_none()
    
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )
    
    await db.delete(organization)
    await db.commit()


async def get_organization_users(
    db: AsyncSession,
    organization_id: int,
) -> List[schemas.UserOrganizationResponse]:
    """Get all users in an organization."""
    result = await db.execute(
        select(user_organizations)
        .where(user_organizations.c.organization_id == organization_id)
    )
    user_orgs = result.all()
    
    return [
        schemas.UserOrganizationResponse(
            user_id=uo[0],  # user_id is first column
            organization_id=uo[1],  # organization_id is second column
            role=uo[2],  # role is third column
            created_at=uo[3],  # created_at is fourth column
        )
        for uo in user_orgs
    ]


async def add_user_to_organization(
    db: AsyncSession,
    organization_id: int,
    user_id: int,
    role: OrganizationRole,
) -> schemas.UserOrganizationResponse:
    """Add a user to an organization."""
    # Check if organization exists
    org_result = await db.execute(
        select(Organization).where(Organization.id == organization_id)
    )
    if not org_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )
    
    # Check if user exists
    user_result = await db.execute(select(User).where(User.id == user_id))
    if not user_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Check if user is already in organization
    existing_result = await db.execute(
        select(user_organizations).where(
            user_organizations.c.user_id == user_id,
            user_organizations.c.organization_id == organization_id
        )
    )
    if existing_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already in this organization"
        )
    
    # Add user to organization
    from datetime import datetime
    insert_stmt = user_organizations.insert().values(
        user_id=user_id,
        organization_id=organization_id,
        role=role,
        created_at=datetime.utcnow()
    )
    await db.execute(insert_stmt)
    await db.commit()
    
    # Return the relationship
    result = await db.execute(
        select(user_organizations).where(
            user_organizations.c.user_id == user_id,
            user_organizations.c.organization_id == organization_id
        )
    )
    uo = result.first()
    
    if not uo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Failed to retrieve created relationship"
        )
    
    return schemas.UserOrganizationResponse(
        user_id=uo[0],  # user_id is first column
        organization_id=uo[1],  # organization_id is second column
        role=uo[2],  # role is third column
        created_at=uo[3],  # created_at is fourth column
    )


async def update_user_role_in_organization(
    db: AsyncSession,
    organization_id: int,
    user_id: int,
    new_role: OrganizationRole,
) -> schemas.UserOrganizationResponse:
    """Update user's role in an organization."""
    # Check if relationship exists
    result = await db.execute(
        select(user_organizations).where(
            user_organizations.c.user_id == user_id,
            user_organizations.c.organization_id == organization_id
        )
    )
    uo = result.scalar_one_or_none()
    
    if not uo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not in this organization"
        )
    
    # Update role
    update_stmt = (
        user_organizations.update()
        .where(
            user_organizations.c.user_id == user_id,
            user_organizations.c.organization_id == organization_id
        )
        .values(role=new_role)
    )
    await db.execute(update_stmt)
    await db.commit()
    
    # Return updated relationship
    result = await db.execute(
        select(user_organizations).where(
            user_organizations.c.user_id == user_id,
            user_organizations.c.organization_id == organization_id
        )
    )
    uo = result.first()
    
    if not uo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Failed to retrieve updated relationship"
        )
    
    return schemas.UserOrganizationResponse(
        user_id=uo[0],  # user_id is first column
        organization_id=uo[1],  # organization_id is second column
        role=uo[2],  # role is third column
        created_at=uo[3],  # created_at is fourth column
    )


async def remove_user_from_organization(
    db: AsyncSession,
    organization_id: int,
    user_id: int,
) -> None:
    """Remove a user from an organization."""
    # Check if relationship exists
    result = await db.execute(
        select(user_organizations).where(
            user_organizations.c.user_id == user_id,
            user_organizations.c.organization_id == organization_id
        )
    )
    uo = result.scalar_one_or_none()
    
    if not uo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not in this organization"
        )
    
    # Remove user from organization
    delete_stmt = user_organizations.delete().where(
        user_organizations.c.user_id == user_id,
        user_organizations.c.organization_id == organization_id
    )
    await db.execute(delete_stmt)
    await db.commit()
