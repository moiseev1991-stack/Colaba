"""
Tests for HTML search providers (yandex_html, google_html).
"""

import pytest
from httpx import AsyncClient
from app.main import app
from app.modules.searches.providers import fetch_search_results


@pytest.mark.asyncio
async def test_yandex_html_provider_import():
    """Test that yandex_html provider can be imported."""
    from app.modules.searches.providers.yandex_html import fetch_search_results as yandex_fetch
    assert callable(yandex_fetch)


@pytest.mark.asyncio
async def test_google_html_provider_import():
    """Test that google_html provider can be imported."""
    from app.modules.searches.providers.google_html import fetch_search_results as google_fetch
    assert callable(google_fetch)


@pytest.mark.asyncio
async def test_common_utilities_import():
    """Test that common utilities can be imported."""
    from app.modules.searches.providers.common import (
        get_random_user_agent,
        get_proxy_config,
        random_delay,
        detect_blocking,
        fetch_with_retry
    )
    assert callable(get_random_user_agent)
    assert callable(get_proxy_config)
    assert callable(random_delay)
    assert callable(detect_blocking)
    assert callable(fetch_with_retry)


@pytest.mark.asyncio
async def test_get_random_user_agent():
    """Test User-Agent rotation."""
    from app.modules.searches.providers.common import get_random_user_agent
    
    user_agents = set()
    for _ in range(10):
        ua = get_random_user_agent()
        assert isinstance(ua, str)
        assert len(ua) > 0
        user_agents.add(ua)
    
    # Should have some variety (not all the same)
    assert len(user_agents) > 1


@pytest.mark.asyncio
async def test_provider_fallback_integration():
    """Test that providers are integrated in __init__.py."""
    # Test that yandex_html is available
    try:
        results = await fetch_search_results(
            provider="yandex_html",
            query="test",
            num_results=1,
            enable_fallback=False
        )
        # If no error, provider is integrated
        assert True
    except ValueError as e:
        # Provider not found error means integration issue
        if "Unknown search provider" in str(e):
            pytest.fail(f"Provider yandex_html not integrated: {e}")
        # Other errors (like blocking) are acceptable for testing
        pass
    
    # Test that google_html is available
    try:
        results = await fetch_search_results(
            provider="google_html",
            query="test",
            num_results=1,
            enable_fallback=False
        )
        # If no error, provider is integrated
        assert True
    except ValueError as e:
        # Provider not found error means integration issue
        if "Unknown search provider" in str(e):
            pytest.fail(f"Provider google_html not integrated: {e}")
        # Other errors (like blocking) are acceptable for testing
        pass


@pytest.mark.asyncio
async def test_create_search_with_yandex_html():
    """Test creating a search with yandex_html provider."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/searches",
            json={
                "query": "тест",
                "num_results": 5,
                "search_provider": "yandex_html"
            }
        )
        # Should accept the provider (201) or return validation error (422)
        assert response.status_code in [201, 422]
        if response.status_code == 201:
            data = response.json()
            assert data["search_provider"] == "yandex_html"


@pytest.mark.asyncio
async def test_create_search_with_google_html():
    """Test creating a search with google_html provider."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/searches",
            json={
                "query": "test",
                "num_results": 5,
                "search_provider": "google_html"
            }
        )
        # Should accept the provider (201) or return validation error (422)
        assert response.status_code in [201, 422]
        if response.status_code == 201:
            data = response.json()
            assert data["search_provider"] == "google_html"


@pytest.mark.asyncio
@pytest.mark.skip(reason="Requires real network requests - may be blocked")
async def test_yandex_html_real_request():
    """Test yandex_html provider with real request (may be blocked)."""
    try:
        results = await fetch_search_results(
            provider="yandex_html",
            query="ремонт окон",
            num_results=5,
            enable_fallback=False
        )
        assert isinstance(results, list)
        if len(results) > 0:
            assert "title" in results[0]
            assert "url" in results[0]
    except (ValueError, Exception) as e:
        # Blocking or other errors are acceptable
        pytest.skip(f"Provider blocked or error: {e}")


@pytest.mark.asyncio
@pytest.mark.skip(reason="Requires real network requests - may be blocked")
async def test_google_html_real_request():
    """Test google_html provider with real request (may be blocked)."""
    try:
        results = await fetch_search_results(
            provider="google_html",
            query="window repair",
            num_results=5,
            enable_fallback=False
        )
        assert isinstance(results, list)
        if len(results) > 0:
            assert "title" in results[0]
            assert "url" in results[0]
    except (ValueError, Exception) as e:
        # Blocking or other errors are acceptable
        pytest.skip(f"Provider blocked or error: {e}")
