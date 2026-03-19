"""
Script to create a test user for development.
"""

import asyncio
import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from app.core.config import settings
from app.core.security import hash_password
from app.models.user import User


async def create_test_user():
    """Create a test user for development."""
    engine = create_async_engine(settings.DATABASE_URL)
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    email = os.environ.get("TEST_EMAIL", "test@example.com")
    password = os.environ.get("TEST_PASSWORD", "test123456")

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == email))
        existing_user = result.scalar_one_or_none()

        if existing_user:
            print("Test user already exists!")
            print(f"Email: {existing_user.email}")
            return

        # Create test user
        user = User(
            email=email,
            hashed_password=hash_password(password),
            is_active=True,
            is_superuser=False,
        )

        db.add(user)
        await db.commit()
        await db.refresh(user)

        print("Test user created successfully!")
        print(f"Email: {user.email}")
        print(f"User ID: {user.id}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(create_test_user())
