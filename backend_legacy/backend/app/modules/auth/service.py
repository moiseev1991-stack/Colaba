"""
Auth module service.
"""

from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status

from app.models.user import User
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token, decode_token
from app.modules.auth import schemas


async def register_user(
    db: AsyncSession,
    user_data: schemas.UserRegister,
) -> schemas.UserResponse:
    """
    Register a new user.
    
    Args:
        db: Database session
        user_data: User registration data
    
    Returns:
        UserResponse: Created user
    
    Raises:
        HTTPException: 400 if email already exists
    """
    # Check if user with this email already exists
    result = await db.execute(
        select(User).where(User.email == user_data.email)
    )
    existing_user = result.scalar_one_or_none()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    hashed_password = hash_password(user_data.password)
    user = User(
        email=user_data.email,
        hashed_password=hashed_password,
        is_active=True,
        is_superuser=False,
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    return schemas.UserResponse.model_validate(user)


async def authenticate_user(
    db: AsyncSession,
    email: str,
    password: str,
) -> Optional[User]:
    """
    Authenticate user by email and password.
    
    Args:
        db: Database session
        email: User email
        password: Plain text password
    
    Returns:
        User if authentication successful, None otherwise
    """
    result = await db.execute(
        select(User).where(User.email == email)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        return None
    
    if not user.is_active:
        return None
    
    if not verify_password(password, user.hashed_password):
        return None
    
    return user


async def login_user(
    db: AsyncSession,
    login_data: schemas.UserLogin,
) -> schemas.TokenResponse:
    """
    Login user and return tokens.
    
    Args:
        db: Database session
        login_data: User login data
    
    Returns:
        TokenResponse: Access and refresh tokens
    
    Raises:
        HTTPException: 401 if credentials are invalid
    """
    user = await authenticate_user(db, login_data.email, login_data.password)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Create tokens
    access_token = create_access_token(data={"sub": str(user.id)})
    refresh_token = create_refresh_token(data={"sub": str(user.id)})
    
    return schemas.TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer"
    )


async def refresh_access_token(
    db: AsyncSession,
    refresh_token: str,
) -> schemas.TokenResponse:
    """
    Refresh access token using refresh token.
    
    Args:
        db: Database session
        refresh_token: JWT refresh token
    
    Returns:
        TokenResponse: New access and refresh tokens
    
    Raises:
        HTTPException: 401 if refresh token is invalid
    """
    payload = decode_token(refresh_token)
    
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if token is a refresh token
    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
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
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Verify user exists and is active
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Create new tokens
    access_token = create_access_token(data={"sub": str(user.id)})
    refresh_token = create_refresh_token(data={"sub": str(user.id)})
    
    return schemas.TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer"
    )


async def get_current_user(
    db: AsyncSession,
    user_id: int,
) -> schemas.UserResponse:
    """
    Get current user by ID.
    
    Args:
        db: Database session
        user_id: User ID
    
    Returns:
        UserResponse: User data
    
    Raises:
        HTTPException: 404 if user not found
    """
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return schemas.UserResponse.model_validate(user)
