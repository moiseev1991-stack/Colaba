"""
FastAPI dependencies: authentication, authorization, database.

Используется для Dependency Injection в endpoints.
"""

from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select
from app.core.database import get_db
from app.core.security import decode_token

# HTTP Bearer token scheme
security = HTTPBearer()


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> int:
    """
    Dependency для получения текущего user ID из JWT token.
    
    Args:
        credentials: HTTP Bearer token credentials
    
    Returns:
        int: Current user ID
    
    Raises:
        HTTPException: 401 if token is invalid or missing
    
    Usage:
        @router.get("/users/me")
        async def get_current_user(user_id: int = Depends(get_current_user_id)):
            ...
    """
    token = credentials.credentials
    payload = decode_token(token)
    
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        user_id = int(user_id_str)
        return user_id
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in token",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_optional_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(
        HTTPBearer(auto_error=False)
    ),
) -> Optional[int]:
    """
    Dependency для получения текущего user ID (опционально).
    
    Returns None если token отсутствует или невалиден.
    Используется для endpoints, которые работают как с авторизованными, так и с неавторизованными пользователями.
    
    Args:
        credentials: HTTP Bearer token credentials (optional)
    
    Returns:
        Optional[int]: Current user ID, or None if not authenticated
    
    Usage:
        @router.get("/public")
        async def public_endpoint(user_id: Optional[int] = Depends(get_optional_user_id)):
            ...
    """
    if not credentials:
        return None
    
    token = credentials.credentials
    payload = decode_token(token)
    
    if not payload:
        return None
    
    user_id_str = payload.get("sub")
    if not user_id_str:
        return None
    
    try:
        return int(user_id_str)
    except ValueError:
        return None


async def get_current_user(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Dependency для получения текущего пользователя из БД.
    
    Args:
        user_id: Current user ID from token
        db: Database session
    
    Returns:
        User: Current user object
    
    Raises:
        HTTPException: 404 if user not found
    """
    from app.models.user import User
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return user


async def get_current_organization_id(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> int:
    """
    Dependency для получения organization_id текущего пользователя.
    
    Возвращает первую организацию пользователя (в будущем можно добавить выбор организации).
    Для суперадминистраторов возвращает None (они могут видеть все организации).
    
    Args:
        user_id: Current user ID from token
        db: Database session
    
    Returns:
        int: Current user's organization ID, or None for superusers
    
    Raises:
        HTTPException: 404 if user has no organizations and is not superuser
    """
    from app.models.user import User
    from app.models.organization import user_organizations
    
    # Check if user is superuser
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if user and user.is_superuser:
        # Superusers don't need organization_id - they can see all
        return None
    
    # Get user's first organization from user_organizations table
    result = await db.execute(
        select(user_organizations.c.organization_id)
        .where(user_organizations.c.user_id == user_id)
        .limit(1)
    )
    org_id = result.scalar_one_or_none()
    
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User has no organizations"
        )
    
    return org_id


async def require_superuser(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Dependency для проверки, что пользователь является суперадминистратором.
    
    Args:
        user_id: Current user ID from token
        db: Database session
    
    Returns:
        User: Current user object (guaranteed to be superuser)
    
    Raises:
        HTTPException: 403 if user is not superuser
    """
    from app.models.user import User
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if not user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superuser access required"
        )
    
    return user


async def require_organization_admin_or_owner(
    organization_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Dependency для проверки, что пользователь является администратором или владельцем организации.
    
    Проверяет:
    1. Является ли пользователь суперадминистратором (is_superuser=True) - доступ ко всем организациям
    2. Имеет ли пользователь роль OWNER или ADMIN в указанной организации
    
    Args:
        organization_id: Organization ID to check access for
        user_id: Current user ID from token
        db: Database session
    
    Returns:
        tuple: (user, organization_id, role) - user object, organization_id, and user's role
    
    Raises:
        HTTPException: 403 if user doesn't have required permissions
    """
    from app.models.user import User
    from app.models.organization import user_organizations, OrganizationRole
    
    # Check if user is superuser
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Superusers have access to all organizations
    if user.is_superuser:
        return (user, organization_id, OrganizationRole.OWNER)
    
    # Check user's role in organization
    result = await db.execute(
        select(user_organizations).where(
            user_organizations.c.user_id == user_id,
            user_organizations.c.organization_id == organization_id
        )
    )
    uo = result.first()
    
    if not uo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this organization"
        )
    
    role = uo[2]  # role is third column
    
    # Only OWNER and ADMIN can manage organization
    if role not in (OrganizationRole.OWNER, OrganizationRole.ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization admin or owner access required"
        )
    
    return (user, organization_id, role)


# Re-export get_db for convenience
__all__ = [
    "get_db",
    "get_current_user_id",
    "get_optional_user_id",
    "get_current_user",
    "get_current_organization_id",
    "require_superuser",
    "require_organization_admin_or_owner",
]
