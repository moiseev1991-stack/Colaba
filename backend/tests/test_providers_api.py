"""
Tests for providers API endpoints.
"""

import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.core.security import create_access_token, hash_password
from app.core.database import AsyncSessionLocal
from app.models.user import User


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
            email=unique_email("provider_admin"),
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
            email=unique_email("provider_user"),
            hashed_password=hash_password("userpass"),
            is_active=True,
            is_superuser=False,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user


@pytest.fixture
async def regular_token(regular_user):
    """Create access token for regular user."""
    return create_access_token(data={"sub": str(regular_user.id)})


class TestProvidersList:
    @pytest.mark.asyncio
    async def test_list_providers_success(self, client, regular_token):
        """Test listing providers with auth."""
        response = await client.get(
            "/api/v1/providers",
            headers={"Authorization": f"Bearer {regular_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_list_providers_unauthorized(self, client):
        """Test listing providers without auth fails."""
        response = await client.get("/api/v1/providers")
        # HTTPBearer returns 403 when no token is provided
        assert response.status_code in [401, 403]


class TestProviderDetail:
    @pytest.mark.asyncio
    async def test_get_provider_success(self, client, regular_token):
        """Test getting provider detail."""
        response = await client.get(
            "/api/v1/providers/yandex_html",
            headers={"Authorization": f"Bearer {regular_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "settings_schema" in data

    @pytest.mark.asyncio
    async def test_get_provider_not_found(self, client, regular_token):
        """Test getting nonexistent provider."""
        response = await client.get(
            "/api/v1/providers/nonexistent",
            headers={"Authorization": f"Bearer {regular_token}"},
        )
        assert response.status_code == 404


class TestProviderUpdate:
    @pytest.mark.asyncio
    async def test_update_provider_success(self, client, superuser_token):
        """Test updating provider config as superuser."""
        response = await client.put(
            "/api/v1/providers/yandex_html",
            json={"config": {"use_proxy": False}},
            headers={"Authorization": f"Bearer {superuser_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "provider_id" in data

    @pytest.mark.asyncio
    async def test_update_provider_non_superuser(self, client, regular_token):
        """Test updating provider as non-superuser fails."""
        response = await client.put(
            "/api/v1/providers/yandex_html",
            json={"config": {"use_proxy": False}},
            headers={"Authorization": f"Bearer {regular_token}"},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_update_provider_not_found(self, client, superuser_token):
        """Test updating nonexistent provider."""
        response = await client.put(
            "/api/v1/providers/nonexistent",
            json={"config": {"test_key": "test_value"}},
            headers={"Authorization": f"Bearer {superuser_token}"},
        )
        assert response.status_code == 404


class TestProviderTest:
    @pytest.mark.asyncio
    async def test_test_provider_requires_superuser(self, client, regular_token):
        """Test that provider test requires superuser."""
        response = await client.post(
            "/api/v1/providers/duckduckgo/test",
            json={"query": "test"},
            headers={"Authorization": f"Bearer {regular_token}"},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_test_provider_not_found(self, client, superuser_token):
        """Test provider test with nonexistent provider."""
        response = await client.post(
            "/api/v1/providers/nonexistent/test",
            json={"query": "test"},
            headers={"Authorization": f"Bearer {superuser_token}"},
        )
        assert response.status_code == 404
