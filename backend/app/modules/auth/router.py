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


def _verification_required() -> bool:
    """Верификация обязательна? Только при настроенном SMTP — без почты
    не блокируем вход (fail-open), но пишем warning один раз на процесс."""
    if not settings.REQUIRE_EMAIL_VERIFICATION:
        return False
    if not (settings.SMTP_HOST and settings.SMTP_USER):
        return False
    return True


async def _send_verification_letter(db, user) -> bool:
    """Отправить письмо подтверждения. True — отправлено."""
    from app.modules.auth.emails import send_transactional_email, verify_email_html

    raw = await _issue_auth_token(db, user.id, "email_verify", ttl_seconds=24 * 3600)
    return await send_transactional_email(
        user.email,
        "SpinLid — подтверждение email",
        verify_email_html(_auth_token_link("email_verify", raw)),
    )


@router.post("/register", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(
    request: Request,
    user_data: schemas.UserRegister,
    db: AsyncSession = Depends(get_db),
):
    """
    Register a new user.

    Creates a new user account with email + password + приветственные
    кредиты (WELCOME_CREDITS). При настроенном SMTP — сразу отправляем
    письмо подтверждения: вход запрещён до подтверждения email.
    """
    user = await service.register_user(db=db, user_data=user_data)
    try:
        from app.modules.billing.service import grant_welcome_credits

        await grant_welcome_credits(db, user.id)
    except Exception:
        # Кредиты — не причина блокировать регистрацию
        import logging

        logging.getLogger(__name__).exception("Welcome credits grant failed for user %s", user.id)

    verification_required = False
    if _verification_required():
        try:
            verification_required = await _send_verification_letter(db, user)
        except Exception:
            import logging

            logging.getLogger(__name__).exception("Verification letter on register failed (user %s)", user.id)

    resp = schemas.UserResponse.model_validate(user)
    resp.email_verification_required = verification_required
    return resp


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


class EmailOnly(BaseModel):
    email: EmailStr


@router.post("/verify-email/resend")
@limiter.limit("3/minute")
async def verify_email_resend(
    request: Request,
    payload: EmailOnly,
    db: AsyncSession = Depends(get_db),
):
    """Публичная повторная отправка письма подтверждения — для тех, кто ещё
    не может войти. Анти-перебор: всегда одинаковый ответ."""
    if not _verification_required():
        return {"message": "Подтверждение email не требуется"}
    user = (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    if user and user.is_active and not user.email_verified and not user.email.endswith("@oauth.local"):
        try:
            await _send_verification_letter(db, user)
        except Exception:
            import logging

            logging.getLogger(__name__).exception("Verification resend failed (user %s)", user.id)
    return {"message": "Если аккаунт ожидает подтверждения — письмо отправлено"}


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


# ---------------------------------------------------------------------------
# Настройки аккаунта (19.09): смена пароля, смена email, сессии, удаление
# Практики: ре-аутентификация паролем перед чувствительными изменениями,
# подтверждение нового email до переключения, честная danger zone.
# ---------------------------------------------------------------------------

from itsdangerous import URLSafeTimedSerializer  # noqa: E402

from sqlalchemy import func  # noqa: E402

from app.core.security import verify_password  # noqa: E402

_email_change_serializer = URLSafeTimedSerializer(secret_key=settings.SECRET_KEY, salt="email-change")


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=72)


class EmailChangeRequest(BaseModel):
    password: str
    new_email: EmailStr


class EmailChangeConfirm(BaseModel):
    payload: str


class PasswordOnly(BaseModel):
    password: str


async def _get_user_or_404(db: AsyncSession, user_id: int) -> User:
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return user


def _revoke_sessions(user: User) -> None:
    """Все ранее выданные JWT юзера становятся недействительными."""
    user.tokens_valid_from = datetime.now(timezone.utc).replace(tzinfo=None)


@router.post("/change-password")
@limiter.limit("10/minute")
async def change_password(
    request: Request,
    payload: ChangePasswordRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Смена пароля: требует текущий пароль, отзывает все сессии
    (включая текущую — юзер входит заново с новым паролем)."""
    user = await _get_user_or_404(db, user_id)
    if not user.hashed_password or not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Текущий пароль неверен")
    user.hashed_password = hash_password(payload.new_password)
    _revoke_sessions(user)
    await db.commit()
    return {"message": "Пароль изменён — войдите заново с новым паролем"}


@router.post("/email/change-request")
@limiter.limit("5/minute")
async def email_change_request(
    request: Request,
    payload: EmailChangeRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Запрос смены email: письмо-подтверждение уходит на НОВЫЙ адрес,
    текущий продолжает работать до подтверждения (double opt-in)."""
    from app.modules.auth.emails import send_transactional_email

    user = await _get_user_or_404(db, user_id)
    if not user.hashed_password or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Пароль неверен")
    new_email = payload.new_email.lower()
    if new_email == user.email.lower():
        raise HTTPException(status_code=400, detail="Это уже ваш текущий email")
    taken = (
        await db.execute(select(func.count()).select_from(User).where(func.lower(User.email) == new_email))
    ).scalar_one()
    if taken:
        raise HTTPException(status_code=400, detail="Этот email уже занят другим аккаунтом")

    signed = _email_change_serializer.dumps({"uid": user.id, "email": new_email})
    link = f"{settings.OAUTH_FRONTEND_URL.rstrip('/')}/auth/email-change?payload={signed}"
    sent = await send_transactional_email(
        new_email,
        "SpinLid — подтверждение нового email",
        f"""<p>Вы запросили смену email аккаунта SpinLid на этот адрес.</p>
<p><a href="{link}" style="display:inline-block;background:#059669;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Подтвердить новый email</a></p>
<p style="font-size:13px;color:#86868b">Ссылка действует 24 часа. Если вы не запрашивали смену — просто проигнорируйте письмо.</p>""",
    )
    if not sent:
        raise HTTPException(status_code=503, detail="Не удалось отправить письмо — попробуйте позже")
    return {"message": f"Письмо с подтверждением отправлено на {new_email}"}


@router.post("/email/change-confirm")
@limiter.limit("10/minute")
async def email_change_confirm(
    request: Request,
    payload: EmailChangeConfirm,
    db: AsyncSession = Depends(get_db),
):
    """Подтверждение смены email по ссылке из письма (страница /auth/email-change)."""
    try:
        data = _email_change_serializer.loads(payload.payload, max_age=24 * 3600)
    except Exception:
        raise HTTPException(status_code=400, detail="Ссылка недействительна или истекла")
    user = await db.get(User, int(data["uid"]))
    new_email = str(data["email"]).lower()
    if not user:
        raise HTTPException(status_code=400, detail="Аккаунт не найден")
    if user.email.lower() == new_email:
        return {"message": "Email уже обновлён"}
    taken = (
        await db.execute(select(func.count()).select_from(User).where(func.lower(User.email) == new_email))
    ).scalar_one()
    if taken:
        raise HTTPException(status_code=400, detail="Этот email уже занят другим аккаунтом")
    user.email = new_email
    user.email_verified = True  # владение адресом доказано кликом по письму
    await db.commit()
    return {"message": "Email обновлён — войдите с новым адресом"}


@router.post("/sessions/revoke")
async def revoke_sessions(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """«Выйти со всех устройств»: убивает все ранее выданные токены."""
    user = await _get_user_or_404(db, user_id)
    _revoke_sessions(user)
    await db.commit()
    return {"message": "Все сессии завершены — войдите заново"}


@router.delete("/account")
@limiter.limit("3/minute")
async def delete_account(
    request: Request,
    payload: PasswordOnly,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Удаление аккаунта (danger zone): деактивация с проверкой пароля.
    Последнего суперпользователя удалить нельзя — останетесь без админки."""
    user = await _get_user_or_404(db, user_id)
    if not user.hashed_password or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Пароль неверен")
    if user.is_superuser:
        other_admins = (
            await db.execute(
                select(func.count())
                .select_from(User)
                .where(User.is_superuser.is_(True), User.is_active.is_(True), User.id != user.id)
            )
        ).scalar_one()
        if not other_admins:
            raise HTTPException(status_code=400, detail="Нельзя удалить последнего администратора")
    user.is_active = False
    _revoke_sessions(user)
    await db.commit()
    return {"message": "Аккаунт деактивирован"}


@router.get("/connections")
async def list_connections(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Подключённые внешние входы (Яндекс/VK/…) для страницы аккаунта."""
    from app.models.social_account import SocialAccount

    rows = (
        (await db.execute(select(SocialAccount).where(SocialAccount.user_id == user_id).order_by(SocialAccount.id)))
        .scalars()
        .all()
    )
    return {
        "connections": [
            {
                "provider": c.provider.value if hasattr(c.provider, "value") else str(c.provider),
                "email": c.provider_email,
                "name": c.provider_name,
            }
            for c in rows
        ]
    }
