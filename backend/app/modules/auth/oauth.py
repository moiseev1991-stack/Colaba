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
    def get_vk_oauth_url(redirect_uri: str, state: str) -> str:
        """Generate VK ID OAuth authorization URL."""
        params = {
            "client_id": settings.VK_CLIENT_ID,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "email",
            "state": state,
        }
        return f"https://oauth.vk.com/authorize?{urlencode(params)}"

    @staticmethod
    def verify_telegram_auth(auth_data: Dict[str, Any], bot_token: str) -> bool:
        """Verify Telegram Login Widget authentication data."""
        if "hash" not in auth_data:
            return False

        hash_value = auth_data.pop("hash")

        # Create data check string
        data_check_items = [f"{k}={v}" for k, v in sorted(auth_data.items())]
        data_check_string = "\n".join(data_check_items)

        # Create secret key from bot token
        secret_key = hashlib.sha256(bot_token.encode()).digest()

        # Calculate hash
        calculated_hash = hmac.new(
            secret_key, data_check_string.encode(), hashlib.sha256
        ).hexdigest()

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
