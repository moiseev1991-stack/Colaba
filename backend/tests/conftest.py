"""
Pytest configuration and fixtures for backend tests.

Provides:
- Async test client
- User fixtures (superuser, regular user)
- Auth token fixtures
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


# ============================================================
# Client Fixtures
# ============================================================

@pytest.fixture
async def client():
    """Create async test client without auth override."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# ============================================================
# User Fixtures - use unique emails for test isolation
# ============================================================

@pytest.fixture
async def superuser():
    """Create a superuser for admin operations.

    Uses unique email to avoid conflicts.
    No explicit cleanup - test DB should be cleaned separately.
    """
    async with AsyncSessionLocal() as db:
        user = User(
            email=unique_email("superuser"),
            hashed_password=hash_password("superuser_password"),
            is_active=True,
            is_superuser=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user


@pytest.fixture
async def regular_user():
    """Create a regular (non-superuser) user."""
    async with AsyncSessionLocal() as db:
        user = User(
            email=unique_email("regular"),
            hashed_password=hash_password("regular_password"),
            is_active=True,
            is_superuser=False,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user


@pytest.fixture
async def inactive_user():
    """Create an inactive user for testing access control."""
    async with AsyncSessionLocal() as db:
        user = User(
            email=unique_email("inactive"),
            hashed_password=hash_password("inactive_password"),
            is_active=False,
            is_superuser=False,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user


# ============================================================
# Token Fixtures
# ============================================================

@pytest.fixture
async def superuser_token(superuser):
    """Create valid access token for superuser."""
    return create_access_token(data={"sub": str(superuser.id)})


@pytest.fixture
async def regular_user_token(regular_user):
    """Create valid access token for regular user."""
    return create_access_token(data={"sub": str(regular_user.id)})


@pytest.fixture
async def inactive_user_token(inactive_user):
    """Create token for inactive user (for testing access control)."""
    return create_access_token(data={"sub": str(inactive_user.id)})


@pytest.fixture
def invalid_token():
    """Return an invalid/expired token string."""
    return "invalid.token.here"


# ============================================================
# Auth Helper Fixtures
# ============================================================

@pytest.fixture
def auth_headers(superuser_token):
    """Return Authorization headers dict for superuser."""
    return {"Authorization": f"Bearer {superuser_token}"}


@pytest.fixture
def regular_auth_headers(regular_user_token):
    """Return Authorization headers dict for regular user."""
    return {"Authorization": f"Bearer {regular_user_token}"}


# ============================================================
# Pytest Configuration
# ============================================================

def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line("markers", "asyncio: mark test as async")
