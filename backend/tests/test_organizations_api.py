"""
Tests for organizations API endpoints.
"""

import uuid
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.core.security import create_access_token, hash_password
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.models.organization import Organization, user_organizations, OrganizationRole


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
            email=unique_email("org_admin"),
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
            email=unique_email("org_user"),
            hashed_password=hash_password("userpass"),
            is_active=True,
            is_superuser=False,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user


@pytest.fixture
async def test_organization(superuser):
    """Create a test organization."""
    async with AsyncSessionLocal() as db:
        org = Organization(name=f"Test Org {uuid.uuid4().hex[:8]}")
        db.add(org)
        await db.commit()
        await db.refresh(org)
        return org


class TestOrganizationsCRUD:
    @pytest.mark.asyncio
    async def test_create_organization_success(self, client, superuser_token):
        """Test creating organization as superuser."""
        response = await client.post(
            "/api/v1/organizations",
            json={"name": "New Test Org"},
            headers={"Authorization": f"Bearer {superuser_token}"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "New Test Org"
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_organization_unauthorized(self, client):
        """Test creating organization without auth fails."""
        response = await client.post(
            "/api/v1/organizations",
            json={"name": "New Org"},
        )
        # HTTPBearer returns 403 when no token is provided
        assert response.status_code in [401, 403]

    @pytest.mark.asyncio
    async def test_create_organization_non_superuser(self, client, regular_user):
        """Test creating organization as non-superuser fails."""
        token = create_access_token(data={"sub": str(regular_user.id)})
        response = await client.post(
            "/api/v1/organizations",
            json={"name": "New Org"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_list_organizations_success(self, client, superuser_token):
        """Test listing organizations as superuser."""
        response = await client.get(
            "/api/v1/organizations",
            headers={"Authorization": f"Bearer {superuser_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_get_organization_success(self, client, superuser_token, test_organization):
        """Test getting organization by ID."""
        response = await client.get(
            f"/api/v1/organizations/{test_organization.id}",
            headers={"Authorization": f"Bearer {superuser_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == test_organization.name

    @pytest.mark.asyncio
    async def test_get_organization_not_found(self, client, superuser_token):
        """Test getting nonexistent organization."""
        response = await client.get(
            "/api/v1/organizations/99999",
            headers={"Authorization": f"Bearer {superuser_token}"},
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_organization_success(self, client, superuser_token, test_organization):
        """Test updating organization."""
        response = await client.put(
            f"/api/v1/organizations/{test_organization.id}",
            json={"name": "Updated Name"},
            headers={"Authorization": f"Bearer {superuser_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Name"

    @pytest.mark.asyncio
    async def test_delete_organization_success(self, client, superuser_token):
        """Test deleting organization."""
        # Create org to delete
        create_resp = await client.post(
            "/api/v1/organizations",
            json={"name": "To Delete"},
            headers={"Authorization": f"Bearer {superuser_token}"},
        )
        org_id = create_resp.json()["id"]

        response = await client.delete(
            f"/api/v1/organizations/{org_id}",
            headers={"Authorization": f"Bearer {superuser_token}"},
        )
        assert response.status_code == 204


class TestOrganizationUsers:
    @pytest.mark.asyncio
    async def test_get_organization_users(self, client, superuser_token, test_organization, regular_user):
        """Test getting users in organization."""
        # Add user to organization
        async with AsyncSessionLocal() as db:
            from datetime import datetime
            await db.execute(
                user_organizations.insert().values(
                    user_id=regular_user.id,
                    organization_id=test_organization.id,
                    role=OrganizationRole.MEMBER,
                    created_at=datetime.utcnow(),
                )
            )
            await db.commit()

        response = await client.get(
            f"/api/v1/organizations/{test_organization.id}/users",
            headers={"Authorization": f"Bearer {superuser_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1

    @pytest.mark.asyncio
    async def test_add_user_to_organization(self, client, superuser_token, test_organization, regular_user):
        """Test adding user to organization."""
        response = await client.post(
            f"/api/v1/organizations/{test_organization.id}/users",
            json={"user_id": regular_user.id, "role": "MEMBER"},
            headers={"Authorization": f"Bearer {superuser_token}"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["user_id"] == regular_user.id
