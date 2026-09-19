"""
OAuth authentication service.

Supports Google, Yandex, VK, and Telegram authentication.
"""

from typing import Optional, Dict, Any
from urllib.parse import urlencode
import hashlib
import hmac

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token
from app.models.user import User
from app.models.social_account import SocialAccount, OAuthProvider


class OAuthService:
    """OAuth authentication service."""

    @staticmethod
    def get_google_oauth_url(redirect_uri: str, state: str) -> str:
        """Generate Google OAuth authorization URL."""
        params = {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "access_type": "offline",
            "prompt": "consent",
        }
        return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"

    @staticmethod
    def get_yandex_oauth_url(redirect_uri: str, state: str) -> str:
        """Generate Yandex OAuth authorization URL."""
        params = {
            "client_id": settings.YANDEX_CLIENT_ID,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "state": state,
        }
        return f"https://oauth.yandex.ru/authorize?{urlencode(params)}"

    @staticmethod
    def get_vk_oauth_url(redirect_uri: str, state: str, code_challenge: str) -> str:
        """VK ID OAuth 2.1 (id.vk.ru, аудит 18.09): PKCE обязателен.

        code_challenge = BASE64URL(SHA256(code_verifier)) без паддинга;
        code_verifier хранится в подписанной state-куке и возвращается
        при обмене кода.
        """
        params = {
            "response_type": "code",
            "client_id": settings.VK_CLIENT_ID,
            "redirect_uri": redirect_uri,
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "scope": "vkid.personal_info email",
        }
        return f"https://id.vk.ru/authorize?{urlencode(params)}"

    TELEGRAM_AUTH_MAX_AGE = 24 * 3600  # реплей-фикс (аудит В-3): виджет живёт сутки

    @staticmethod
    def verify_telegram_auth(auth_data: Dict[str, Any], bot_token: str) -> bool:
        """Verify Telegram Login Widget authentication data (HMAC + свежесть)."""
        import time

        if "hash" not in auth_data:
            return False

        # 18.09: перехваченные данные виджета не должны работать вечно
        auth_date = auth_data.get("auth_date")
        try:
            if not auth_date or time.time() - int(auth_date) > OAuthService.TELEGRAM_AUTH_MAX_AGE:
                return False
        except (TypeError, ValueError):
            return False

        hash_value = auth_data.pop("hash")

        # Create data check string
        data_check_items = [f"{k}={v}" for k, v in sorted(auth_data.items())]
        data_check_string = "\n".join(data_check_items)

        # Create secret key from bot token
        secret_key = hashlib.sha256(bot_token.encode()).digest()

        # Calculate hash
        calculated_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

        return hmac.compare_digest(calculated_hash, hash_value)

    @staticmethod
    async def get_or_create_user_from_oauth(
        db: AsyncSession,
        provider: OAuthProvider,
        provider_user_id: str,
        email: Optional[str],
        name: Optional[str],
        avatar: Optional[str],
    ) -> User:
        """
        Get existing user or create new one from OAuth data.
        Links social account to existing user by email.
        """
        # Check if social account exists
        result = await db.execute(
            select(SocialAccount).where(
                SocialAccount.provider == provider,
                SocialAccount.provider_user_id == provider_user_id,
            )
        )
        social_account = result.scalar_one_or_none()

        if social_account:
            # User exists, return it
            user = await db.get(User, social_account.user_id)
            if user:
                return user

        # Check if user with this email exists
        user = None
        if email:
            result = await db.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()

        # Create new user if not exists
        created = False
        if not user:
            # Generate a random password for OAuth users
            import secrets

            random_password = secrets.token_urlsafe(32)

            user = User(
                email=email or f"{provider.value}_{provider_user_id}@oauth.local",
                hashed_password="",  # Will be set below
                is_active=True,
                is_superuser=False,
            )
            from app.core.security import hash_password

            user.hashed_password = hash_password(random_password)
            db.add(user)
            await db.flush()
            created = True

        # 18.09 (Этап 3): email от OAuth-провайдера считается верифицированным
        if email and user.email_verified is False:
            user.email_verified = True

        # Create social account
        social_account = SocialAccount(
            user_id=user.id,
            provider=provider,
            provider_user_id=provider_user_id,
            provider_email=email,
            provider_name=name,
            provider_avatar=avatar,
        )
        db.add(social_account)
        await db.commit()

        # Auto-provision personal organization для нового OAuth-юзера —
        # аналогично register_user. Без org приложение для него нерабочее
        # (404 на /dashboard, /searches). Для существующего юзера вызов
        # идемпотентен (вернёт уже существующую org).
        from app.modules.organizations.service import (
            ensure_user_has_personal_organization,
        )

        await ensure_user_has_personal_organization(db, user)

        # 19.09: новому OAuth-юзеру — приветственные кредиты бесплатного
        # тарифа, как при обычной регистрации (раньде соцвход их не выдавал).
        if created:
            try:
                from app.modules.billing.service import grant_welcome_credits

                await grant_welcome_credits(db, user.id)
            except Exception:
                # Кредиты — не причина блокировать вход
                import logging

                logging.getLogger(__name__).exception("Welcome credits grant failed for OAuth user %s", user.id)

        return user

    @staticmethod
    async def generate_tokens_for_user(user: User) -> Dict[str, str]:
        """Generate access and refresh tokens for user."""
        access_token = create_access_token(
            data={"sub": str(user.id), "type": "access"},
        )
        refresh_token = create_refresh_token(
            data={"sub": str(user.id), "type": "refresh"},
        )
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
        }
