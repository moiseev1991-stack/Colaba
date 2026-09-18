"""OAuth authentication router — VK ID (OAuth 2.1+PKCE), Яндекс ID, Google, Telegram.

Переработка 18.09 (аудит авторизации, чиним 3 дефекта старого кода):
- префикс /auth/oauth — совпадает с фронтендом (/api/v1/auth/oauth/...);
- state хранится в ПОДПИСАННОЙ КУКЕ (itsdangerous, 10 мин) вместо
  request.session, которого не было → было 500;
- state обязателен: нет/не совпал → 400 (раньше отсутствие state
  пропускало проверку);
- VK: новый VK ID flow (id.vk.ru) с PKCE + device_id;
- Яндекс: в обмен кода добавлен redirect_uri (рекомендация Яндекс);
- Telegram: POST JSON от виджета, свежесть auth_date ≤24ч.
"""

import hashlib
import secrets
from base64 import urlsafe_b64encode
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.social_account import OAuthProvider
from app.modules.auth.oauth import OAuthService

router = APIRouter(prefix="/auth/oauth", tags=["oauth"])

oauth_service = OAuthService()

_STATE_COOKIE = "oauth_state"
_STATE_MAX_AGE = 600  # 10 минут на весь OAuth-редирект

_serializer = URLSafeTimedSerializer(secret_key=settings.SECRET_KEY, salt="oauth-state")


def _sign_state(payload: dict) -> str:
    return _serializer.dumps(payload)


def _load_state(cookie_value: Optional[str]) -> Optional[dict]:
    if not cookie_value:
        return None
    try:
        data = _serializer.loads(cookie_value, max_age=_STATE_MAX_AGE)
        return data if isinstance(data, dict) else None
    except (BadSignature, SignatureExpired):
        return None


def _set_state_cookie(response: Response, payload: dict) -> None:
    response.set_cookie(
        _STATE_COOKIE,
        _sign_state(payload),
        max_age=_STATE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=settings.ENVIRONMENT == "production",
        path="/",
    )


def _pkce_pair() -> tuple[str, str]:
    """(code_verifier, code_challenge=S256) для VK ID."""
    verifier = secrets.token_urlsafe(64)[:128]  # 43–128 символов по спецификации
    challenge = urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return verifier, challenge


@router.get("/{provider}")
async def oauth_login(
    provider: str,
    response: Response,
    redirect_uri: Optional[str] = Query(None),
):
    """
    Инициировать OAuth-вход: 302 на страницу провайдера.
    state (+PKCE verifier для VK) подписывается в куку oauth_state.
    """
    state = secrets.token_urlsafe(32)
    payload: dict = {"state": state, "r": redirect_uri or ""}

    if not redirect_uri:
        redirect_uri = f"{settings.OAUTH_FRONTEND_URL}/auth/callback"

    provider_lower = provider.lower()

    if provider_lower == "yandex":
        if not settings.YANDEX_CLIENT_ID:
            raise HTTPException(status_code=400, detail="Yandex OAuth не настроен")
        url = oauth_service.get_yandex_oauth_url(redirect_uri, state)
    elif provider_lower == "vk":
        if not settings.VK_CLIENT_ID:
            raise HTTPException(status_code=400, detail="VK ID OAuth не настроен")
        verifier, challenge = _pkce_pair()
        payload["vk_verifier"] = verifier
        url = oauth_service.get_vk_oauth_url(redirect_uri, state, challenge)
    elif provider_lower == "google":
        if not settings.GOOGLE_CLIENT_ID:
            raise HTTPException(status_code=400, detail="Google OAuth не настроен")
        url = oauth_service.get_google_oauth_url(redirect_uri, state)
    else:
        raise HTTPException(status_code=400, detail=f"Неподдерживаемый провайдер: {provider}")

    _set_state_cookie(response, payload)
    return RedirectResponse(url=url)


@router.get("/{provider}/callback")
async def oauth_callback(
    provider: str,
    request: Request,
    response: Response,
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    device_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    OAuth-колбэк: код → токены провайдера → юзер → наша пара JWT (в JSON;
    прокси кладёт их в httpOnly-куки).

    state обязателен и должен совпасть с подписанной кукой (CSRF).
    """
    if not code:
        raise HTTPException(status_code=400, detail="Нет кода авторизации")

    stored = _load_state(request.cookies.get(_STATE_COOKIE))
    if not stored or not state or state != stored.get("state"):
        # 18.09: отсутствие state больше не пропускает проверку
        raise HTTPException(status_code=400, detail="Неверный state — повторите вход")
    response.delete_cookie(_STATE_COOKIE, path="/")

    redirect_uri = stored.get("r") or f"{settings.OAUTH_FRONTEND_URL}/auth/callback"

    provider_lower = provider.lower()
    async with httpx.AsyncClient(timeout=20) as client:
        if provider_lower == "yandex":
            user_data = await _handle_yandex(client, code, redirect_uri)
            oauth_provider = OAuthProvider.YANDEX
        elif provider_lower == "vk":
            user_data = await _handle_vk_id(client, code, redirect_uri, state, stored.get("vk_verifier", ""), device_id)
            oauth_provider = OAuthProvider.VK
        elif provider_lower == "google":
            user_data = await _handle_google(client, code, redirect_uri)
            oauth_provider = OAuthProvider.GOOGLE
        else:
            raise HTTPException(status_code=400, detail=f"Неподдерживаемый провайдер: {provider}")

    user = await oauth_service.get_or_create_user_from_oauth(
        db=db,
        provider=oauth_provider,
        provider_user_id=user_data["id"],
        email=user_data.get("email"),
        name=user_data.get("name"),
        avatar=user_data.get("avatar"),
    )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован")

    return await oauth_service.generate_tokens_for_user(user)


async def _handle_yandex(client: httpx.AsyncClient, code: str, redirect_uri: str) -> dict:
    """Яндекс ID: код → токен (с redirect_uri) → login.yandex.ru/info."""
    token_response = await client.post(
        "https://oauth.yandex.ru/token",
        data={
            "client_id": settings.YANDEX_CLIENT_ID,
            "client_secret": settings.YANDEX_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
        },
    )
    token_data = token_response.json()
    if "error" in token_data:
        raise HTTPException(
            status_code=400, detail=f"Yandex OAuth: {token_data.get('error_description', token_data['error'])}"
        )

    user_response = await client.get(
        "https://login.yandex.ru/info",
        headers={"Authorization": f"OAuth {token_data['access_token']}"},
    )
    user_info = user_response.json()
    return {
        "id": str(user_info["id"]),
        "email": user_info.get("default_email") or (user_info.get("emails") or [None])[0],
        "name": user_info.get("real_name") or user_info.get("display_name"),
        "avatar": user_info.get("default_avatar_id"),
    }


async def _handle_vk_id(
    client: httpx.AsyncClient,
    code: str,
    redirect_uri: str,
    state: str,
    code_verifier: str,
    device_id: Optional[str],
) -> dict:
    """VK ID (id.vk.ru, OAuth 2.1): код+PKCE → access_token → user_info."""
    token_response = await client.post(
        "https://id.vk.ru/oauth2/auth",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "code_verifier": code_verifier,
            "client_id": settings.VK_CLIENT_ID,
            "service_token": settings.VK_CLIENT_SECRET,
            "redirect_uri": redirect_uri,
            "state": state,
            **({"device_id": device_id} if device_id else {}),
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    token_data = token_response.json()
    if "error" in token_data or "access_token" not in token_data:
        detail = token_data.get("error_description") or token_data.get("error") or "no access_token"
        raise HTTPException(status_code=400, detail=f"VK ID: {detail}")

    user_response = await client.post(
        "https://id.vk.ru/oauth2/user_info",
        data={"client_id": settings.VK_CLIENT_ID, "access_token": token_data["access_token"]},
    )
    user = user_response.json().get("user") or {}
    return {
        "id": str(user.get("user_id") or token_data.get("user_id")),
        "email": user.get("email"),
        "name": f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or None,
        "avatar": user.get("avatar"),
    }


async def _handle_google(client: httpx.AsyncClient, code: str, redirect_uri: str) -> dict:
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
        raise HTTPException(status_code=400, detail="Google OAuth error")

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


@router.post("/telegram")
async def telegram_login(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Telegram Login Widget: виджет на фронте POST'ит данные сюда
    (HMAC проверяется + свежесть auth_date ≤24ч). Ответ — пара JWT,
    прокси кладёт их в httpOnly-куки."""
    if not settings.TELEGRAM_BOT_TOKEN:
        raise HTTPException(status_code=400, detail="Telegram OAuth не настроен")

    try:
        auth_data = dict(await request.json())
    except Exception:
        auth_data = dict(request.query_params)

    if not oauth_service.verify_telegram_auth(auth_data.copy(), settings.TELEGRAM_BOT_TOKEN):
        raise HTTPException(status_code=400, detail="Неверные данные Telegram-авторизации")

    user = await oauth_service.get_or_create_user_from_oauth(
        db=db,
        provider=OAuthProvider.TELEGRAM,
        provider_user_id=str(auth_data["id"]),
        email=None,  # Telegram не отдаёт email
        name=auth_data.get("first_name") or auth_data.get("username"),
        avatar=auth_data.get("photo_url"),
    )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован")

    return await oauth_service.generate_tokens_for_user(user)
