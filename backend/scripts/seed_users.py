"""
Seed script: create admin and test users with correct passwords.
Ensures both can log in. Test user is assigned to default organization.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, text
from app.core.config import settings
from app.core.security import hash_password
from app.models.user import User
from app.models.organization import Organization, user_organizations, OrganizationRole


async def seed_users():
    engine = create_async_engine(settings.DATABASE_URL)
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with AsyncSessionLocal() as db:
        # 1. Ensure default organization exists
        result = await db.execute(select(Organization).where(Organization.id == 1))
        org = result.scalar_one_or_none()
        if not org:
            org = Organization(id=1, name="Default Organization")
            db.add(org)
            await db.commit()
            await db.refresh(org)
            print("Created Default Organization (id=1)")

        # 2. Admin user: sir.nikam@example.com / 1234
        admin_email = "sir.nikam@example.com"
        admin_password = "1234"
        result = await db.execute(select(User).where(User.email == admin_email))
        admin = result.scalar_one_or_none()
        if admin:
            admin.hashed_password = hash_password(admin_password)
            admin.is_superuser = True
            admin.is_active = True
            await db.commit()
            print(f"Updated admin: {admin_email} / {admin_password}")
        else:
            admin = User(
                email=admin_email,
                hashed_password=hash_password(admin_password),
                is_active=True,
                is_superuser=True,
            )
            db.add(admin)
            await db.commit()
            await db.refresh(admin)
            print(f"Created admin: {admin_email} / {admin_password} (ID: {admin.id})")

        # 3. Test user: test@example.com / test123456
        test_email = "test@example.com"
        test_password = "test123456"
        result = await db.execute(select(User).where(User.email == test_email))
        test_user = result.scalar_one_or_none()
        if test_user:
            test_user.hashed_password = hash_password(test_password)
            test_user.is_active = True
            test_user.is_superuser = False
            await db.commit()
            await db.refresh(test_user)
            print(f"Updated test user: {test_email} / {test_password}")
        else:
            test_user = User(
                email=test_email,
                hashed_password=hash_password(test_password),
                is_active=True,
                is_superuser=False,
            )
            db.add(test_user)
            await db.commit()
            await db.refresh(test_user)
            print(f"Created test user: {test_email} / {test_password} (ID: {test_user.id})")

        # 4. Ensure test user is in default organization (required for non-superusers)
        check = await db.execute(
            select(user_organizations).where(
                user_organizations.c.user_id == test_user.id,
                user_organizations.c.organization_id == 1,
            )
        )
        if check.first() is None:
            from datetime import datetime
            await db.execute(
                user_organizations.insert().values(
                    user_id=test_user.id,
                    organization_id=1,
                    role=OrganizationRole.OWNER,
                    created_at=datetime.utcnow(),
                )
            )
            await db.commit()
            print(f"Assigned test user to Default Organization")

    await engine.dispose()
    print("\nLogin credentials:")
    print("  Admin:  sir.nikam@example.com / 1234")
    print("  User:   test@example.com / test123456")


if __name__ == "__main__":
    asyncio.run(seed_users())
