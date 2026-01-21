"""
FastAPI dependencies: authentication, authorization, database.

Используется для Dependency Injection в endpoints.
"""

from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

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


# Re-export get_db for convenience
__all__ = ["get_db", "get_current_user_id", "get_optional_user_id"]
