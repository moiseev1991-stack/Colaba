"""
Auth module router.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, get_current_user_id
from app.modules.auth import schemas, service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: schemas.UserRegister,
    db: AsyncSession = Depends(get_db),
):
    """
    Register a new user.
    
    Creates a new user account with email and password.
    """
    return await service.register_user(db=db, user_data=user_data)


@router.post("/login", response_model=schemas.TokenResponse)
async def login(
    login_data: schemas.UserLogin,
    db: AsyncSession = Depends(get_db),
):
    """
    Login user and get access tokens.
    
    Returns JWT access token and refresh token.
    """
    return await service.login_user(db=db, login_data=login_data)


@router.post("/refresh", response_model=schemas.TokenResponse)
async def refresh_token(
    refresh_data: schemas.RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Refresh access token using refresh token.
    
    Returns new access token and refresh token.
    """
    return await service.refresh_access_token(db=db, refresh_token=refresh_data.refresh_token)


@router.get("/me", response_model=schemas.UserResponse)
async def get_me(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Get current user information.
    
    Returns information about the authenticated user.
    """
    return await service.get_current_user(db=db, user_id=user_id)
