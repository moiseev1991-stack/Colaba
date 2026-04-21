"""
Admin views for SQLAdmin.
"""

from app.admin.views.users import UserAdmin
from app.admin.views.organizations import OrganizationAdmin
from app.admin.views.searches import SearchAdmin
from app.admin.views.deployments import DeploymentAdmin
from app.admin.views.search_results import SearchResultAdmin
from app.admin.views.blacklist_domains import BlacklistDomainAdmin
from app.admin.views.social_accounts import SocialAccountAdmin
from app.admin.views.search_provider_configs import SearchProviderConfigAdmin
from app.admin.views.ai_assistants import AiAssistantAdmin
from app.admin.views.captcha_bypass_configs import CaptchaBypassConfigAdmin
from app.admin.views.email_templates import EmailTemplateAdmin
from app.admin.views.email_domains import EmailDomainAdmin
from app.admin.views.email_campaigns import EmailCampaignAdmin
from app.admin.views.email_logs import EmailLogAdmin
from app.admin.views.email_replies import EmailReplyAdmin

__all__ = [
    "UserAdmin",
    "OrganizationAdmin",
    "SearchAdmin",
    "DeploymentAdmin",
    "SearchResultAdmin",
    "BlacklistDomainAdmin",
    "SocialAccountAdmin",
    "SearchProviderConfigAdmin",
    "AiAssistantAdmin",
    "CaptchaBypassConfigAdmin",
    "EmailTemplateAdmin",
    "EmailDomainAdmin",
    "EmailCampaignAdmin",
    "EmailLogAdmin",
    "EmailReplyAdmin",
]
