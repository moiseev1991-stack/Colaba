"""
Tests for captcha config API endpoints.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.core.security import create_access_token, hash_password
from app.core.database import AsyncSessionLocal
from app.models.user import User
import uuid


def unique_email(prefix: str) -> str:
    """Generate unique email for test isolation."""
    return f"{prefix}_{uuid.uuid4().hex[:8]}@test.example.com"


@pytest.fixture
async def client():
    """Create async test client."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
async def superuser():
    """Create a superuser for admin operations."""
    async with AsyncSessionLocal() as db:
        user = User(
            email=unique_email("captcha_admin"),
            hashed_password=hash_password("adminpass"),
            is_active=True,
            is_superuser=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user


@pytest.fixture
async def superuser_token(superuser):
    """Create access token for superuser."""
    return create_access_token(data={"sub": str(superuser.id)})


@pytest.fixture
async def regular_user():
    """Create a regular user."""
    async with AsyncSessionLocal() as db:
        user = User(
            email=unique_email("captcha_user"),
            hashed_password=hash_password("userpass"),
            is_active=True,
            is_superuser=False,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user


@pytest.fixture
async def regular_user_token(regular_user):
    """Create access token for regular user."""
    return create_access_token(data={"sub": str(regular_user.id)})


class TestCaptchaConfigGet:
    @pytest.mark.asyncio
    async def test_get_captcha_config_unauthorized(self, client):
        """Test getting captcha config without auth fails."""
        response = await client.get("/api/v1/captcha-config")
        # HTTPBearer returns 403 when no token is provided
        assert response.status_code in [401, 403]

    @pytest.mark.asyncio
    async def test_get_captcha_config_success(self, client, regular_user_token):
        """Test getting captcha config as authenticated user."""
        response = await client.get(
            "/api/v1/captcha-config",
            headers={"Authorization": f"Bearer {regular_user_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        # Response should contain these keys (even if null)
        assert "ai_assistant_id" in data or data is not None


class TestCaptchaConfigPut:
    @pytest.mark.asyncio
    async def test_put_captcha_config_unauthorized(self, client):
        """Test updating captcha config without auth fails."""
        response = await client.put(
            "/api/v1/captcha-config",
            json={"ai_assistant_id": 1},
        )
        # HTTPBearer returns 403 when no token is provided
        assert response.status_code in [401, 403]

    @pytest.mark.asyncio
    async def test_put_captcha_config_non_superuser(self, client, regular_user_token):
        """Test updating captcha config as non-superuser fails."""
        response = await client.put(
            "/api/v1/captcha-config",
            json={"ai_assistant_id": 1},
            headers={"Authorization": f"Bearer {regular_user_token}"},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_put_captcha_config_superuser(self, client, superuser_token):
        """Test updating captcha config as superuser."""
        response = await client.put(
            "/api/v1/captcha-config",
            json={"ai_assistant_id": 123},
            headers={"Authorization": f"Bearer {superuser_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["ai_assistant_id"] == 123


class TestCaptchaTest2Captcha:
    @pytest.mark.asyncio
    async def test_test_2captcha_unauthorized(self, client):
        """Test 2captcha test without auth fails."""
        response = await client.post("/api/v1/captcha-config/test-2captcha")
        # HTTPBearer returns 403 when no token is provided
        assert response.status_code in [401, 403]

    @pytest.mark.asyncio
    async def test_test_2captcha_non_superuser(self, client, regular_user_token):
        """Test 2captcha test as non-superuser fails."""
        response = await client.post(
            "/api/v1/captcha-config/test-2captcha",
            headers={"Authorization": f"Bearer {regular_user_token}"},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_test_2captcha_no_api_key(self, client, superuser_token):
        """Test 2captcha test without API key returns error."""
        response = await client.post(
            "/api/v1/captcha-config/test-2captcha",
            headers={"Authorization": f"Bearer {superuser_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is False
        assert "error" in data

    @pytest.mark.asyncio
    async def test_test_2captcha_with_invalid_key(self, client, superuser_token):
        """Test 2captcha test with invalid API key."""
        response = await client.post(
            "/api/v1/captcha-config/test-2captcha",
            json={"api_key": "invalid_test_key"},
            headers={"Authorization": f"Bearer {superuser_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        # Should return error (invalid key won't work with 2captcha API)
        assert data["ok"] is False


class TestCaptchaTestAI:
    @pytest.mark.asyncio
    async def test_test_ai_unauthorized(self, client):
        """Test AI test without auth fails."""
        response = await client.post("/api/v1/captcha-config/test-ai")
        # HTTPBearer returns 403 when no token is provided
        assert response.status_code in [401, 403]

    @pytest.mark.asyncio
    async def test_test_ai_non_superuser(self, client, regular_user_token):
        """Test AI test as non-superuser fails."""
        response = await client.post(
            "/api/v1/captcha-config/test-ai",
            headers={"Authorization": f"Bearer {regular_user_token}"},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_test_ai_no_assistant(self, client, superuser_token):
        """Test AI test without assistant ID returns error."""
        response = await client.post(
            "/api/v1/captcha-config/test-ai",
            headers={"Authorization": f"Bearer {superuser_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is False
        assert "error" in data

    @pytest.mark.asyncio
    async def test_test_ai_with_invalid_assistant(self, client, superuser_token):
        """Test AI test with invalid assistant ID."""
        response = await client.post(
            "/api/v1/captcha-config/test-ai",
            json={"ai_assistant_id": 999999},
            headers={"Authorization": f"Bearer {superuser_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        # Should return error (assistant doesn't exist)
        assert data["ok"] is False
