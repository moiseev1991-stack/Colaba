"""
Tests for filters API endpoints.
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
async def test_user():
    """Create a test user with unique email."""
    async with AsyncSessionLocal() as db:
        user = User(
            email=unique_email("filters"),
            hashed_password=hash_password("testpass"),
            is_active=True,
            is_superuser=False,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user


@pytest.fixture
async def test_user_token(test_user):
    """Create access token for test user."""
    return create_access_token(data={"sub": str(test_user.id)})


class TestFiltersSEO:
    @pytest.mark.asyncio
    async def test_create_seo_filter_success(self, client, test_user_token):
        """Test creating SEO filter."""
        response = await client.post(
            "/api/v1/filters/seo",
            json={
                "name": "Test SEO Filter",
                "config": {"min_title_length": 30, "max_title_length": 60},
            },
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Test SEO Filter"
        assert "id" in data
        assert "created_at" in data

    @pytest.mark.asyncio
    async def test_create_seo_filter_minimal(self, client, test_user_token):
        """Test creating SEO filter with minimal data."""
        response = await client.post(
            "/api/v1/filters/seo",
            json={"name": "Minimal Filter"},
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Minimal Filter"

    @pytest.mark.asyncio
    async def test_create_seo_filter_empty_name(self, client, test_user_token):
        """Test creating SEO filter with empty name fails."""
        response = await client.post(
            "/api/v1/filters/seo",
            json={"name": ""},
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 422

    @pytest.mark.skip(reason="Optional auth requires user_id=1 to exist in DB")
    @pytest.mark.asyncio
    async def test_create_seo_filter_optional_auth(self, client):
        """Test creating SEO filter without auth (uses default user)."""
        response = await client.post(
            "/api/v1/filters/seo",
            json={"name": "Anonymous Filter"},
        )
        # Should succeed - endpoint uses optional auth with default user_id=1
        assert response.status_code == 201


class TestFiltersBlacklist:
    @pytest.mark.asyncio
    async def test_create_blacklist_domain_success(self, client, test_user_token):
        """Test adding domain to blacklist."""
        response = await client.post(
            "/api/v1/filters/blacklist",
            json={"domain": "spam.example.com"},
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["domain"] == "spam.example.com"
        assert "id" in data
        assert "created_at" in data

    @pytest.mark.asyncio
    async def test_create_blacklist_domain_empty(self, client, test_user_token):
        """Test adding empty domain to blacklist fails."""
        response = await client.post(
            "/api/v1/filters/blacklist",
            json={"domain": ""},
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 422

    @pytest.mark.skip(reason="Optional auth requires user_id=1 to exist in DB")
    @pytest.mark.asyncio
    async def test_create_blacklist_optional_auth(self, client):
        """Test adding domain without auth (uses default user)."""
        response = await client.post(
            "/api/v1/filters/blacklist",
            json={"domain": "anon.example.com"},
        )
        assert response.status_code == 201


class TestFiltersAudit:
    @pytest.mark.asyncio
    async def test_run_seo_audit_success(self, client, test_user_token):
        """Test running SEO audit."""
        response = await client.post(
            "/api/v1/filters/audit",
            json={"url": "https://example.com"},
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        # Note: actual audit may fail in test env without network
        # but we can check the endpoint structure
        assert response.status_code in [200, 201]
        data = response.json()
        assert "url" in data
        assert "score" in data

    @pytest.mark.asyncio
    async def test_run_seo_audit_empty_url(self, client, test_user_token):
        """Test running SEO audit with empty URL fails."""
        response = await client.post(
            "/api/v1/filters/audit",
            json={"url": ""},
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_run_seo_audit_with_config(self, client, test_user_token):
        """Test running SEO audit with custom config."""
        response = await client.post(
            "/api/v1/filters/audit",
            json={
                "url": "https://example.com",
                "config": {"check_mobile": True, "check_speed": False},
            },
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code in [200, 201]
