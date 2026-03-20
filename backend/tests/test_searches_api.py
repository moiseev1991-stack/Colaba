"""
Tests for searches API endpoints.
"""

import uuid
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.core.security import create_access_token, hash_password
from app.core.database import AsyncSessionLocal
from app.models.user import User


async def _create_superuser_headers() -> dict:
    """Create a superuser and return Authorization headers."""
    async with AsyncSessionLocal() as db:
        user = User(
            email=f"searches_{uuid.uuid4().hex[:8]}@test.example.com",
            hashed_password=hash_password("testpass"),
            is_active=True,
            is_superuser=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        token = create_access_token(data={"sub": str(user.id)})
        return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_health_check():
    """Test health check endpoint."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_create_search():
    """Test creating a search."""
    headers = await _create_superuser_headers()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/searches",
            json={
                "query": "test query",
                "num_results": 5,
            },
            headers=headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert data["query"] == "test query"
        assert data["status"] == "pending"


@pytest.mark.asyncio
async def test_list_searches():
    """Test listing searches."""
    headers = await _create_superuser_headers()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/searches", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
