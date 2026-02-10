"""
Pytest configuration and fixtures for backend tests.
"""

import pytest
from app.main import app
from app.core.dependencies import get_current_user_id, get_current_organization_id


async def override_get_current_user_id() -> int:
    """Return test user ID for API tests (no real auth)."""
    return 1


async def override_get_current_organization_id() -> int | None:
    """Return None (superuser mode) for API tests - allows create/list without org in DB."""
    return None


@pytest.fixture(autouse=True)
def _override_auth_dependencies():
    """Override auth dependencies for tests - APIs return 403 without this."""
    app.dependency_overrides[get_current_user_id] = override_get_current_user_id
    app.dependency_overrides[get_current_organization_id] = override_get_current_organization_id
    yield
    app.dependency_overrides.clear()
