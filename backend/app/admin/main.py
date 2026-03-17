"""
SQLAdmin setup and configuration with i18n support.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import RedirectResponse

from sqladmin import Admin

from app.core.database import engine
from app.admin.views.users import UserAdmin
from app.admin.views.organizations import OrganizationAdmin
from app.admin.views.searches import SearchAdmin
from app.admin.views.search_results import SearchResultAdmin
from app.admin.views.blacklist_domains import BlacklistDomainAdmin
from app.admin.views.social_accounts import SocialAccountAdmin
from app.admin.views.deployments import DeploymentAdmin
from app.admin.views.search_provider_configs import SearchProviderConfigAdmin
from app.admin.views.ai_assistants import AiAssistantAdmin
from app.admin.views.captcha_bypass_configs import CaptchaBypassConfigAdmin
from app.admin.i18n import set_language, get_current_language, DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES


class LanguageMiddleware(BaseHTTPMiddleware):
    """Middleware to set language from cookie for admin routes."""

    async def dispatch(self, request: Request, call_next):
        # Only process admin routes
        if request.url.path.startswith("/admin"):
            # Get language from cookie or use default
            language = request.cookies.get("admin_lang", DEFAULT_LANGUAGE)
            if language not in SUPPORTED_LANGUAGES:
                language = DEFAULT_LANGUAGE
            set_language(language)
        
        response = await call_next(request)
        return response


def setup_admin(app) -> Admin:
    """Setup SQLAdmin with the FastAPI application and i18n support."""

    # Add language middleware
    app.add_middleware(LanguageMiddleware)

    # Add language switch endpoint
    @app.get("/admin/set-language/{language}")
    async def switch_language(request: Request, language: str):
        """Switch admin interface language."""
        if language in SUPPORTED_LANGUAGES:
            set_language(language)
        
        # Redirect back to admin with cookie
        referer = request.headers.get("referer", "/admin")
        response = RedirectResponse(url=referer, status_code=303)
        response.set_cookie("admin_lang", language, max_age=365*24*60*60)
        return response

    # Create admin instance (using default templates)
    admin = Admin(
        app,
        engine,
        title="Colaba Admin",
    )

    # Register admin views - Users & Organizations
    admin.add_view(UserAdmin)
    admin.add_view(OrganizationAdmin)
    admin.add_view(SocialAccountAdmin)

    # Register admin views - Searches
    admin.add_view(SearchAdmin)
    admin.add_view(SearchResultAdmin)
    admin.add_view(BlacklistDomainAdmin)

    # Register admin views - Configuration
    admin.add_view(SearchProviderConfigAdmin)
    admin.add_view(AiAssistantAdmin)
    admin.add_view(CaptchaBypassConfigAdmin)

    # Register admin views - System
    admin.add_view(DeploymentAdmin)

    return admin
