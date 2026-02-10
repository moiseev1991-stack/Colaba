"""
Script to create a test user for development.
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.core.security import hash_password
from app.models.user import User


async def create_test_user():
    """Create a test user for development."""
    engine = create_async_engine(settings.DATABASE_URL)
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with AsyncSessionLocal() as db:
        # Check if user already exists
        from sqlalchemy import select
        result = await db.execute(select(User).where(User.email == "test@example.com"))
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            print("Test user already exists!")
            print(f"Email: {existing_user.email}")
            print("Password: test123456")
            return
        
        # Create test user
        user = User(
            email="test@example.com",
            hashed_password=hash_password("test123456"),
            is_active=True,
            is_superuser=False,
        )
        
        db.add(user)
        await db.commit()
        await db.refresh(user)
        
        print("Test user created successfully!")
        print(f"Email: {user.email}")
        print("Password: test123456")
        print(f"User ID: {user.id}")
    
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(create_test_user())
