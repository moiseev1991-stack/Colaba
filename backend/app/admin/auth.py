"""
Admin authentication for SQLAdmin.

Защищает /admin: только пользователи с `is_superuser=True` могут зайти.
Наследуется от sqladmin.authentication.AuthenticationBackend — это
автоматически регистрирует SessionMiddleware для /admin-секции с
переданным secret_key (нам не нужно подключать его отдельно).
"""

import logging
from typing import Optional, Union

from sqladmin.authentication import AuthenticationBackend
from sqlalchemy import select
from starlette.requests import Request
from starlette.responses import RedirectResponse, Response

from app.core.database import AsyncSessionLocal
from app.core.security import verify_password
from app.models.user import User


logger = logging.getLogger(__name__)


class AdminAuth(AuthenticationBackend):
    """SQLAdmin auth backend — email/password + is_superuser check."""

    async def login(self, request: Request) -> bool:
        """Handle login form submission. Возвращает True если пустить."""
        form = await request.form()
        email = (form.get("username") or "").strip().lower()
        password = form.get("password") or ""

        if not email or not password:
            return False

        async with AsyncSessionLocal() as db:
            result = await db.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()
            if not user or not user.is_superuser:
                # Не различаем «нет такого юзера» и «не superuser» — иначе
                # сливаем существование email'а админу-сканеру.
                logger.warning("admin login denied: email=%s reason=not-found-or-not-superuser", email)
                return False
            if not verify_password(password, user.hashed_password):
                logger.warning("admin login denied: email=%s reason=bad-password", email)
                return False

            request.session.update(
                {"admin_user_id": user.id, "admin_is_superuser": True}
            )
            logger.info("admin login ok: user_id=%s email=%s", user.id, email)
            return True

    async def logout(self, request: Request) -> Union[Response, bool]:
        """Clear session and bounce back to login."""
        request.session.clear()
        return RedirectResponse(url="/admin/login", status_code=302)

    async def authenticate(self, request: Request) -> Union[Response, bool]:
        """Check session on every admin request. False → редирект на /admin/login."""
        if request.session.get("admin_is_superuser") and request.session.get("admin_user_id"):
            return True
        return RedirectResponse(url="/admin/login", status_code=302)
