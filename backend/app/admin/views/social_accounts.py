"""
Social account admin view for SQLAdmin.
"""

from sqladmin import ModelView
from app.models.social_account import SocialAccount, OAuthProvider


def _format_provider(model, prop):
    """Format OAuth provider name."""
    if model.provider is None:
        return "-"
    provider_map = {
        OAuthProvider.google: "Google",
        OAuthProvider.yandex: "Yandex",
        OAuthProvider.vk: "VK",
        OAuthProvider.telegram: "Telegram",
    }
    return provider_map.get(model.provider, str(model.provider))


def _format_user(model, prop):
    """Format user relationship."""
    return str(model.user) if model.user else "-"


class SocialAccountAdmin(ModelView, model=SocialAccount):
    """Admin view for SocialAccount model."""

    name = "Social Account"
    name_plural = "Social Accounts"
    icon = "fa-solid fa-link"

    # Columns to display in list view
    column_list = [
        SocialAccount.id,
        SocialAccount.provider,
        SocialAccount.provider_email,
        SocialAccount.provider_name,
        SocialAccount.user,
        SocialAccount.created_at,
    ]

    # Columns to search
    column_searchable_list = [SocialAccount.provider_email, SocialAccount.provider_name]

    # Default sort
    column_default_sort = [(SocialAccount.created_at, True)]  # True = descending

    # Columns that are sortable
    column_sortable_list = [
        SocialAccount.id,
        SocialAccount.provider,
        SocialAccount.provider_email,
        SocialAccount.created_at,
    ]

    # Make certain fields read-only
    form_readonly_columns = [SocialAccount.created_at]

    # Details view columns
    column_details_list = [
        SocialAccount.id,
        SocialAccount.user,
        SocialAccount.provider,
        SocialAccount.provider_user_id,
        SocialAccount.provider_email,
        SocialAccount.provider_name,
        SocialAccount.provider_avatar,
        SocialAccount.created_at,
    ]

    # Column formatters for human-readable display
    column_formatters = {
        SocialAccount.provider: _format_provider,
        SocialAccount.user: _format_user,
    }

    # Column labels for better readability
    column_labels = {
        SocialAccount.provider: "Provider",
        SocialAccount.provider_user_id: "Provider User ID",
        SocialAccount.provider_email: "Email",
        SocialAccount.provider_name: "Display Name",
        SocialAccount.provider_avatar: "Avatar URL",
    }
