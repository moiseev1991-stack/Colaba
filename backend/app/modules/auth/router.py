"""
Auth module router.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_current_user_id, get_db
from app.core.rate_limit import limiter
from app.core.security import hash_password
from app.models.user import User
from app.modules.auth import schemas, service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(
    request: Request,
    user_data: schemas.UserRegister,
    db: AsyncSession = Depends(get_db),
):
    """
    Register a new user.

    Creates a new user account with email and password + приветственные
    кредиты (WELCOME_CREDITS) — попробовать продукт (тарификация 2026-09).
    """
    user = await service.register_user(db=db, user_data=user_data)
    try:
        from app.modules.billing.service import grant_welcome_credits

        await grant_welcome_credits(db, user.id)
    except Exception:
        # Кредиты — не причина блокировать регистрацию
        import logging

        logging.getLogger(__name__).exception("Welcome credits grant failed for user %s", user.id)
    return user


@router.post("/login", response_model=schemas.TokenResponse)
@limiter.limit("20/minute")
async def login(
    request: Request,
    login_data: schemas.UserLogin,
    db: AsyncSession = Depends(get_db),
):
    """
    Login user and get access tokens.

    Returns JWT access token and refresh token.
    """
    return await service.login_user(db=db, login_data=login_data)


@router.post("/refresh", response_model=schemas.TokenResponse)
@limiter.limit("30/minute")
async def refresh_token(
    request: Request,
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


@router.patch("/me", response_model=schemas.UserResponse)
async def update_me(
    payload: schemas.UserUpdateMe,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Обновление профиля текущего пользователя.

    Пока поддерживается только ``reply_to_email`` — личный email для
    ответов в outreach-рассылке (поле Reply-To). Передайте null или ""
    чтобы сбросить. Без заполненного адреса email-рассылка блокируется.
    """
    return await service.update_current_user(db=db, user_id=user_id, payload=payload)


# ---------------------------------------------------------------------------
# Верификация email и сброс пароля (аудит 18.09, Этап 3)
# ---------------------------------------------------------------------------


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=72)


def _auth_token_link(kind: str, token: str) -> str:
    base = settings.OAUTH_FRONTEND_URL.rstrip("/")
    if kind == "password_reset":
        return f"{base}/auth/reset-password?token={token}"
    return f"{base}/auth/verify-email?token={token}"


async def _issue_auth_token(db: AsyncSession, user_id: int, kind: str, ttl_seconds: int) -> str:
    import hashlib as _hashlib
    import secrets as _secrets
    from datetime import timedelta

    from app.models.auth_token import AuthToken

    raw = _secrets.token_urlsafe(32)
    row = AuthToken(
        user_id=user_id,
        kind=kind,  # type: ignore[arg-type]
        token_hash=_hashlib.sha256(raw.encode()).hexdigest(),
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds),
    )
    db.add(row)
    await db.commit()
    return raw


async def _consume_auth_token(db: AsyncSession, raw_token: str, kind: str) -> int | None:
    """Валидный неиспользованный токен → user_id (и помечаем used)."""
    import hashlib as _hashlib

    from app.models.auth_token import AuthToken

    row = (
        await db.execute(
            select(AuthToken).where(
                AuthToken.token_hash == _hashlib.sha256(raw_token.encode()).hexdigest(),
                AuthToken.kind == kind,
                AuthToken.used_at.is_(None),
                AuthToken.expires_at > datetime.now(timezone.utc),
            )
        )
    ).scalar_one_or_none()
    if not row:
        return None
    row.used_at = datetime.now(timezone.utc)
    await db.flush()
    return row.user_id


@router.post("/password-reset/request")
@limiter.limit("5/minute")
async def password_reset_request(
    request: Request,
    payload: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
):
    """Запрос сброса пароля. ВСЕГДА 200 с одинаковым текстом — не раскрываем,
    существует ли email (защита от перебора)."""
    from app.modules.auth.emails import reset_password_html, send_transactional_email

    user = (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    if user and user.is_active:
        raw = await _issue_auth_token(db, user.id, "password_reset", ttl_seconds=3600)
        await send_transactional_email(
            payload.email,
            "SpinLid — сброс пароля",
            reset_password_html(_auth_token_link("password_reset", raw)),
        )
    return {"message": "Если аккаунт существует, письмо со ссылкой отправлено"}


@router.post("/password-reset/confirm")
@limiter.limit("10/minute")
async def password_reset_confirm(
    request: Request,
    payload: PasswordResetConfirm,
    db: AsyncSession = Depends(get_db),
):
    """Установка нового пароля по одноразовому токену из письма."""
    user_id = await _consume_auth_token(db, payload.token, "password_reset")
    if not user_id:
        raise HTTPException(status_code=400, detail="Ссылка недействительна или истекла")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=400, detail="Пользователь не найден")
    user.hashed_password = hash_password(payload.new_password)
    await db.commit()
    return {"message": "Пароль обновлён — войдите с новым паролем"}


@router.post("/verify-email/request")
async def verify_email_request(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Отправить письмо подтверждения на свой email (залогиненному)."""
    from app.modules.auth.emails import send_transactional_email, verify_email_html

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if user.email_verified:
        return {"message": "Email уже подтверждён"}
    raw = await _issue_auth_token(db, user.id, "email_verify", ttl_seconds=24 * 3600)
    sent = await send_transactional_email(
        user.email,
        "SpinLid — подтверждение email",
        verify_email_html(_auth_token_link("email_verify", raw)),
    )
    return {"message": "Письмо отправлено" if sent else "SMTP не настроен — письмо не отправлено"}


@router.post("/verify-email/confirm")
async def verify_email_confirm(payload: dict, db: AsyncSession = Depends(get_db)):
    """Подтверждение email по токену из письма (вызывается страницей /auth/verify-email)."""
    raw = (payload or {}).get("token") or ""
    user_id = await _consume_auth_token(db, str(raw), "email_verify")
    if not user_id:
        raise HTTPException(status_code=400, detail="Ссылка недействительна или истекла")
    user = await db.get(User, user_id)
    if user:
        user.email_verified = True
    await db.commit()
    return {"message": "Email подтверждён"}
