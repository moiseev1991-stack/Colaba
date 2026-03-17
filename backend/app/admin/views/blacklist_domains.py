"""
Blacklist domain admin view for SQLAdmin.
"""

from sqladmin import ModelView
from app.models.filter import BlacklistDomain


def _format_user(model, prop):
    """Format user relationship."""
    return str(model.user) if model.user else "-"


class BlacklistDomainAdmin(ModelView, model=BlacklistDomain):
    """Admin view for BlacklistDomain model."""

    name = "Blacklist Domain"
    name_plural = "Blacklist Domains"
    icon = "fa-solid fa-ban"

    # Columns to display in list view
    column_list = [
        BlacklistDomain.id,
        BlacklistDomain.domain,
        BlacklistDomain.user,
        BlacklistDomain.created_at,
    ]

    # Columns to search
    column_searchable_list = [BlacklistDomain.domain]

    # Default sort
    column_default_sort = [(BlacklistDomain.created_at, True)]  # True = descending

    # Columns that are sortable
    column_sortable_list = [
        BlacklistDomain.id,
        BlacklistDomain.domain,
        BlacklistDomain.created_at,
    ]

    # Make certain fields read-only
    form_readonly_columns = [BlacklistDomain.created_at]

    # Details view columns
    column_details_list = [
        BlacklistDomain.id,
        BlacklistDomain.domain,
        BlacklistDomain.user,
        BlacklistDomain.created_at,
    ]

    # Column formatters for human-readable display
    column_formatters = {
        BlacklistDomain.user: _format_user,
    }

    # Column labels for better readability
    column_labels = {
        BlacklistDomain.domain: "Domain",
        BlacklistDomain.user: "Added By",
    }
