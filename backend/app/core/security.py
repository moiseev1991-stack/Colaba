"""
Security utilities: JWT tokens, password hashing, authentication.

Использует python-jose для JWT и passlib для хеширования паролей.
"""

from datetime import datetime, timedelta
from typing import Optional

from jose import JWTError, jwt
import bcrypt

from app.core.config import settings


def hash_password(password: str) -> str:
    """
    Хеширование пароля с использованием bcrypt.
    
    Args:
        password: Plain text password
    
    Returns:
        str: Hashed password
    
    Example:
        hashed = hash_password("secure123")
    """
    # Используем bcrypt напрямую для избежания проблем с passlib
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Проверка пароля против хеша.
    
    Args:
        plain_password: Plain text password to verify
        hashed_password: Hashed password from database
    
    Returns:
        bool: True if password matches, False otherwise
    
    Example:
        if verify_password("secure123", user.hashed_password):
            ...
    """
    # Используем bcrypt напрямую для избежания проблем с passlib
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Создание JWT access token.
    
    Args:
        data: Data to encode in token (e.g., {"sub": user_id})
        expires_delta: Custom expiration time (default: ACCESS_TOKEN_EXPIRE_MINUTES)
    
    Returns:
        str: Encoded JWT token
    
    Example:
        token = create_access_token(data={"sub": str(user.id)})
    """
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire, "iat": datetime.utcnow()})
    
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: dict) -> str:
    """
    Создание JWT refresh token.
    
    Args:
        data: Data to encode in token (e.g., {"sub": user_id})
    
    Returns:
        str: Encoded JWT refresh token
    
    Example:
        refresh_token = create_refresh_token(data={"sub": str(user.id)})
    """
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    
    to_encode.update({"exp": expire, "iat": datetime.utcnow(), "type": "refresh"})
    
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> Optional[dict]:
    """
    Декодирование JWT token.
    
    Args:
        token: JWT token to decode
    
    Returns:
        dict: Decoded token payload, or None if invalid
    
    Example:
        payload = decode_token(token)
        if payload:
            user_id = payload.get("sub")
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None


def get_user_id_from_token(token: str) -> Optional[int]:
    """
    Извлечение user ID из JWT token.
    
    Args:
        token: JWT token
    
    Returns:
        int: User ID, or None if invalid token
    
    Example:
        user_id = get_user_id_from_token(token)
        if user_id:
            ...
    """
    payload = decode_token(token)
    if payload:
        user_id_str = payload.get("sub")
        if user_id_str:
            try:
                return int(user_id_str)
            except ValueError:
                return None
    return None
