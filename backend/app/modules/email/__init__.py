"""Email module for Hyvor Relay integration."""

from app.modules.email.service import EmailService, email_service, EmailServiceError
from app.modules.email.campaigns_router import router as campaigns_router
from app.modules.email.replies_router import router as replies_router

__all__ = ["EmailService", "email_service", "EmailServiceError", "campaigns_router", "replies_router"]
