"""
Tests for searches API endpoints.
"""

import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app


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
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/searches",
            json={
                "query": "test query",
                "num_results": 5,
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert data["query"] == "test query"
        assert data["status"] == "pending"


@pytest.mark.asyncio
async def test_list_searches():
    """Test listing searches."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/searches")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
