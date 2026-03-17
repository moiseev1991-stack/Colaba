"""
OAuth authentication router.

Handles Google, Yandex, VK, and Telegram OAuth flows.
"""

import secrets
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.social_account import OAuthProvider
from app.modules.auth.oauth import OAuthService

router = APIRouter(prefix="/oauth", tags=["oauth"])

oauth_service = OAuthService()


@router.get("/{provider}")
async def oauth_login(
    provider: str,
    request: Request,
    redirect_uri: Optional[str] = Query(None),
):
    """
    Initiate OAuth login flow.

    Redirects to the OAuth provider's authorization page.
    """
    # Generate state for CSRF protection
    state = secrets.token_urlsafe(32)

    # Build redirect URI
    if not redirect_uri:
        redirect_uri = f"{settings.OAUTH_FRONTEND_URL}/auth/callback"

    provider_lower = provider.lower()

    if provider_lower == "google":
        if not settings.GOOGLE_CLIENT_ID:
            raise HTTPException(status_code=400, detail="Google OAuth not configured")
        url = oauth_service.get_google_oauth_url(redirect_uri, state)
    elif provider_lower == "yandex":
        if not settings.YANDEX_CLIENT_ID:
            raise HTTPException(status_code=400, detail="Yandex OAuth not configured")
        url = oauth_service.get_yandex_oauth_url(redirect_uri, state)
    elif provider_lower == "vk":
        if not settings.VK_CLIENT_ID:
            raise HTTPException(status_code=400, detail="VK OAuth not configured")
        url = oauth_service.get_vk_oauth_url(redirect_uri, state)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")

    # Store state in session for verification
    request.session["oauth_state"] = state

    return RedirectResponse(url=url)


@router.get("/{provider}/callback", response_model=dict)
async def oauth_callback(
    provider: str,
    request: Request,
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Handle OAuth callback.

    Exchanges authorization code for access token and user info.
    Creates or authenticates user and returns JWT tokens.
    """
    if not code:
        raise HTTPException(status_code=400, detail="Authorization code missing")

    # Verify state
    stored_state = request.session.get("oauth_state")
    if state and stored_state and state != stored_state:
        raise HTTPException(status_code=400, detail="Invalid state")

    provider_lower = provider.lower()
    redirect_uri = f"{settings.OAUTH_FRONTEND_URL}/auth/callback"

    async with httpx.AsyncClient() as client:
        if provider_lower == "google":
            user_data = await _handle_google_callback(client, code, redirect_uri)
            oauth_provider = OAuthProvider.GOOGLE
        elif provider_lower == "yandex":
            user_data = await _handle_yandex_callback(client, code, redirect_uri)
            oauth_provider = OAuthProvider.YANDEX
        elif provider_lower == "vk":
            user_data = await _handle_vk_callback(client, code, redirect_uri)
            oauth_provider = OAuthProvider.VK
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")

    # Create or get user
    user = await oauth_service.get_or_create_user_from_oauth(
        db=db,
        provider=oauth_provider,
        provider_user_id=user_data["id"],
        email=user_data.get("email"),
        name=user_data.get("name"),
        avatar=user_data.get("avatar"),
    )

    # Generate tokens
    tokens = await oauth_service.generate_tokens_for_user(user)

    return tokens


async def _handle_google_callback(
    client: httpx.AsyncClient,
    code: str,
    redirect_uri: str,
) -> dict:
    """Handle Google OAuth callback."""
    # Exchange code for tokens
    token_response = await client.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
        },
    )
    token_data = token_response.json()

    if "error" in token_data:
        raise HTTPException(status_code=400, detail=token_data.get("error_description", "OAuth error"))

    # Get user info
    user_response = await client.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {token_data['access_token']}"},
    )
    user_info = user_response.json()

    return {
        "id": user_info["id"],
        "email": user_info.get("email"),
        "name": user_info.get("name"),
        "avatar": user_info.get("picture"),
    }


async def _handle_yandex_callback(
    client: httpx.AsyncClient,
    code: str,
    redirect_uri: str,
) -> dict:
    """Handle Yandex OAuth callback."""
    # Exchange code for tokens
    token_response = await client.post(
        "https://oauth.yandex.ru/token",
        data={
            "client_id": settings.YANDEX_CLIENT_ID,
            "client_secret": settings.YANDEX_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
        },
    )
    token_data = token_response.json()

    if "error" in token_data:
        raise HTTPException(status_code=400, detail=token_data.get("error_description", "OAuth error"))

    # Get user info
    user_response = await client.get(
        "https://login.yandex.ru/info",
        headers={"Authorization": f"OAuth {token_data['access_token']}"},
    )
    user_info = user_response.json()

    return {
        "id": user_info["id"],
        "email": user_info.get("default_email") or user_info.get("emails", [None])[0],
        "name": user_info.get("real_name") or user_info.get("display_name"),
        "avatar": user_info.get("default_avatar_id"),
    }


async def _handle_vk_callback(
    client: httpx.AsyncClient,
    code: str,
    redirect_uri: str,
) -> dict:
    """Handle VK OAuth callback."""
    # Exchange code for tokens
    token_response = await client.get(
        "https://oauth.vk.com/access_token",
        params={
            "client_id": settings.VK_CLIENT_ID,
            "client_secret": settings.VK_CLIENT_SECRET,
            "code": code,
            "redirect_uri": redirect_uri,
        },
    )
    token_data = token_response.json()

    if "error" in token_data:
        raise HTTPException(status_code=400, detail=token_data.get("error_description", "OAuth error"))

    # Get user info
    user_response = await client.get(
        "https://api.vk.com/method/users.get",
        params={
            "access_token": token_data["access_token"],
            "fields": "photo_200",
            "v": "5.131",
        },
    )
    user_info = user_response.json().get("response", [{}])[0]

    return {
        "id": str(token_data.get("user_id") or user_info.get("id")),
        "email": token_data.get("email"),
        "name": f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}".strip(),
        "avatar": user_info.get("photo_200"),
    }


@router.post("/telegram")
async def telegram_login(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Handle Telegram Login Widget authentication.

    Receives authentication data from Telegram Login Widget.
    """
    if not settings.TELEGRAM_BOT_TOKEN:
        raise HTTPException(status_code=400, detail="Telegram OAuth not configured")

    auth_data = dict(request.query_params) or await request.json()

    # Verify Telegram auth
    if not oauth_service.verify_telegram_auth(auth_data.copy(), settings.TELEGRAM_BOT_TOKEN):
        raise HTTPException(status_code=400, detail="Invalid Telegram authentication")

    # Create or get user
    user = await oauth_service.get_or_create_user_from_oauth(
        db=db,
        provider=OAuthProvider.TELEGRAM,
        provider_user_id=str(auth_data["id"]),
        email=None,  # Telegram doesn't provide email
        name=auth_data.get("first_name") or auth_data.get("username"),
        avatar=auth_data.get("photo_url"),
    )

    # Generate tokens
    tokens = await oauth_service.generate_tokens_for_user(user)

    return tokens
