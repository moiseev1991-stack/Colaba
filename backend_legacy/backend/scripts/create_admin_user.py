"""
Script to create an admin user for development.
"""

import asyncio
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


async def create_admin_user():
    """Create an admin user for development."""
    engine = create_async_engine(settings.DATABASE_URL)
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    email = "sir.nikam@example.com"
    password = "1234"
    
    async with AsyncSessionLocal() as db:
        # Check if user already exists
        result = await db.execute(select(User).where(User.email == email))
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            print(f"User with email {email} already exists!")
            print("Updating user to admin...")
            existing_user.is_superuser = True
            existing_user.is_active = True
            existing_user.hashed_password = hash_password(password)
            await db.commit()
            await db.refresh(existing_user)
            print("User updated successfully!")
            print(f"Email: {existing_user.email}")
            print(f"Password: {password}")
            print(f"Admin: {existing_user.is_superuser}")
            print(f"Active: {existing_user.is_active}")
            print(f"User ID: {existing_user.id}")
            return
        
        # Create admin user
        user = User(
            email=email,
            hashed_password=hash_password(password),
            is_active=True,
            is_superuser=True,  # Admin user
        )
        
        db.add(user)
        await db.commit()
        await db.refresh(user)
        
        print("Admin user created successfully!")
        print(f"Email: {user.email}")
        print(f"Password: {password}")
        print(f"Admin: {user.is_superuser}")
        print(f"Active: {user.is_active}")
        print(f"User ID: {user.id}")
        print("\nYou can now login with:")
        print(f"  Email: {email}")
        print(f"  Password: {password}")
    
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(create_admin_user())
