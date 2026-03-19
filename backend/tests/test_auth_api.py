"""
Tests for auth API endpoints: register, login, refresh, me.
"""

import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.core.security import create_access_token, create_refresh_token, hash_password
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
async def test_user():
    """Create a test user with unique email."""
    async with AsyncSessionLocal() as db:
        user = User(
            email=unique_email("auth_test"),
            hashed_password=hash_password("testpass123"),
            is_active=True,
            is_superuser=False,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user


class TestAuthRegister:
    @pytest.mark.asyncio
    async def test_register_success(self, client):
        """Test successful user registration."""
        email = unique_email("newuser")
        response = await client.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "password": "securepassword123",
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["email"] == email
        assert data["is_active"] is True
        assert data["is_superuser"] is False
        assert "id" in data

    @pytest.mark.asyncio
    async def test_register_duplicate_email(self, client, test_user):
        """Test registration with duplicate email fails."""
        response = await client.post(
            "/api/v1/auth/register",
            json={
                "email": test_user.email,
                "password": "anotherpassword",
            },
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_register_short_password(self, client):
        """Test registration with short password fails."""
        response = await client.post(
            "/api/v1/auth/register",
            json={
                "email": unique_email("shortpass"),
                "password": "short",
            },
        )
        assert response.status_code == 422  # Validation error

    @pytest.mark.asyncio
    async def test_register_invalid_email(self, client):
        """Test registration with invalid email fails."""
        response = await client.post(
            "/api/v1/auth/register",
            json={
                "email": "not-an-email",
                "password": "securepassword123",
            },
        )
        assert response.status_code == 422  # Validation error


class TestAuthLogin:
    @pytest.mark.asyncio
    async def test_login_success(self, client, test_user):
        """Test successful login."""
        response = await client.post(
            "/api/v1/auth/login",
            json={
                "email": test_user.email,
                "password": "testpass123",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    @pytest.mark.asyncio
    async def test_login_wrong_password(self, client, test_user):
        """Test login with wrong password fails."""
        response = await client.post(
            "/api/v1/auth/login",
            json={
                "email": test_user.email,
                "password": "wrongpassword",
            },
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_login_nonexistent_user(self, client):
        """Test login with nonexistent user fails."""
        response = await client.post(
            "/api/v1/auth/login",
            json={
                "email": unique_email("nonexistent"),
                "password": "anypassword",
            },
        )
        assert response.status_code == 401


class TestAuthRefresh:
    @pytest.mark.asyncio
    async def test_refresh_success(self, client, test_user):
        """Test successful token refresh."""
        refresh_token = create_refresh_token(data={"sub": str(test_user.id)})

        response = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data

    @pytest.mark.asyncio
    async def test_refresh_invalid_token(self, client):
        """Test refresh with invalid token fails."""
        response = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": "invalid.token.here"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_refresh_access_token_fails(self, client, test_user):
        """Test using access token for refresh fails."""
        access_token = create_access_token(data={"sub": str(test_user.id)})

        response = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": access_token},
        )
        assert response.status_code == 401


class TestAuthMe:
    @pytest.mark.asyncio
    async def test_me_success(self, client, test_user):
        """Test getting current user info."""
        access_token = create_access_token(data={"sub": str(test_user.id)})

        response = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == test_user.email
        assert data["id"] == test_user.id

    @pytest.mark.asyncio
    async def test_me_no_token(self, client):
        """Test getting current user without token fails."""
        response = await client.get("/api/v1/auth/me")
        # HTTPBearer returns 403 when no token is provided
        assert response.status_code in [401, 403]

    @pytest.mark.asyncio
    async def test_me_invalid_token(self, client):
        """Test getting current user with invalid token fails."""
        response = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer invalid.token"},
        )
        assert response.status_code == 401
