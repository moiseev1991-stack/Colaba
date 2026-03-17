"""
Admin authentication for SQLAdmin.
Protects admin panel with JWT-based authentication.
"""

from typing import Optional
from fastapi import Request, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import verify_password
from app.core.database import AsyncSessionLocal
from app.models.user import User


class AdminAuth:
    """Authentication backend for SQLAdmin panel."""

    def __init__(self, secret_key: str):
        self.secret_key = secret_key

    async def login(self, request: Request) -> bool:
        """Handle login form submission."""
        form = await request.form()
        email = form.get("username")
        password = form.get("password")

        if not email or not password:
            return False

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(User).where(User.email == email)
            )
            user = result.scalar_one_or_none()

            if not user:
                return False

            if not user.is_superuser:
                return False

            # Verify password
            if not verify_password(password, user.hashed_password):
                return False

            # Store user info in session
            request.session.update({
                "user_id": user.id,
                "is_superuser": user.is_superuser
            })
            return True

    async def logout(self, request: Request) -> bool:
        """Handle logout."""
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> Optional[bool]:
        """Check if user is authenticated for admin access."""
        user_id = request.session.get("user_id")
        is_superuser = request.session.get("is_superuser")

        if not user_id or not is_superuser:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated or not a superuser",
            )

        return True
