"""
Organizations module router.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List

from app.core.dependencies import (
    get_db,
    require_superuser,
    require_organization_admin_or_owner,
)
from app.modules.organizations import schemas, service
from app.models.user import User

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.post("", response_model=schemas.OrganizationResponse, status_code=status.HTTP_201_CREATED)
async def create_organization(
    org_data: schemas.OrganizationCreate,
    current_user: User = Depends(require_superuser),
    db=Depends(get_db),
):
    """
    Create a new organization.
    
    Only superusers can create organizations.
    """
    return await service.create_organization(db=db, org_data=org_data)


@router.get("", response_model=List[schemas.OrganizationWithUsersResponse])
async def list_organizations(
    current_user: User = Depends(require_superuser),
    db=Depends(get_db),
):
    """
    List all organizations with statistics.
    
    Only superusers can view all organizations.
    """
    return await service.get_organizations(db=db)


@router.get("/{organization_id}", response_model=schemas.OrganizationResponse)
async def get_organization(
    organization_id: int,
    current_user: User = Depends(require_superuser),
    db=Depends(get_db),
):
    """
    Get a specific organization by ID.
    
    Only superusers can view organizations.
    """
    organization = await service.get_organization(db=db, organization_id=organization_id)
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")
    return organization


@router.put("/{organization_id}", response_model=schemas.OrganizationResponse)
async def update_organization(
    organization_id: int,
    org_data: schemas.OrganizationUpdate,
    current_user: User = Depends(require_superuser),
    db=Depends(get_db),
):
    """
    Update an organization.
    
    Only superusers can update organizations.
    """
    return await service.update_organization(
        db=db,
        organization_id=organization_id,
        org_data=org_data
    )


@router.delete("/{organization_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_organization(
    organization_id: int,
    current_user: User = Depends(require_superuser),
    db=Depends(get_db),
):
    """
    Delete an organization.
    
    Only superusers can delete organizations.
    """
    await service.delete_organization(db=db, organization_id=organization_id)


@router.get("/{organization_id}/users", response_model=List[schemas.UserOrganizationResponse])
async def get_organization_users(
    organization_id: int,
    access_info=Depends(require_organization_admin_or_owner),
    db=Depends(get_db),
):
    """
    Get all users in an organization.
    
    Accessible by:
    - Superusers (can view any organization)
    - Organization owners (OWNER role)
    - Organization admins (ADMIN role)
    """
    return await service.get_organization_users(db=db, organization_id=organization_id)


@router.post("/{organization_id}/users", response_model=schemas.UserOrganizationResponse, status_code=status.HTTP_201_CREATED)
async def add_user_to_organization(
    organization_id: int,
    user_data: schemas.AddUserToOrganizationRequest,
    access_info=Depends(require_organization_admin_or_owner),
    db=Depends(get_db),
):
    """
    Add a user to an organization.
    
    Accessible by:
    - Superusers (can add users to any organization)
    - Organization owners (OWNER role)
    - Organization admins (ADMIN role)
    """
    user, org_id, role = access_info
    return await service.add_user_to_organization(
        db=db,
        organization_id=organization_id,
        user_id=user_data.user_id,
        role=user_data.role
    )


@router.put("/{organization_id}/users/{user_id}/role", response_model=schemas.UserOrganizationResponse)
async def update_user_role(
    organization_id: int,
    user_id: int,
    role_data: schemas.UpdateUserRoleRequest,
    access_info=Depends(require_organization_admin_or_owner),
    db=Depends(get_db),
):
    """
    Update user's role in an organization.
    
    Accessible by:
    - Superusers (can update roles in any organization)
    - Organization owners (OWNER role) - can set any role
    - Organization admins (ADMIN role) - can set MEMBER role only
    """
    user, org_id, user_role = access_info
    from app.models.organization import OrganizationRole
    
    # Admins can only set MEMBER role, not ADMIN or OWNER
    if user_role == OrganizationRole.ADMIN and role_data.role != OrganizationRole.MEMBER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization admins can only assign MEMBER role"
        )
    
    return await service.update_user_role_in_organization(
        db=db,
        organization_id=organization_id,
        user_id=user_id,
        new_role=role_data.role
    )


@router.delete("/{organization_id}/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_user_from_organization(
    organization_id: int,
    user_id: int,
    access_info=Depends(require_organization_admin_or_owner),
    db=Depends(get_db),
):
    """
    Remove a user from an organization.
    
    Accessible by:
    - Superusers (can remove users from any organization)
    - Organization owners (OWNER role)
    - Organization admins (ADMIN role)
    """
    await service.remove_user_from_organization(
        db=db,
        organization_id=organization_id,
        user_id=user_id
    )
