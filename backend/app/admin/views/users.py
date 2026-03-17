"""
User admin view for SQLAdmin.
"""

from sqladmin import ModelView
from app.models.user import User


def _format_bool_yes(model, prop):
    """Format boolean as Yes/No."""
    return "Yes" if model.is_active else "No"


def _format_bool_superuser(model, prop):
    """Format boolean as Yes/No."""
    return "Yes" if model.is_superuser else "No"


class UserAdmin(ModelView, model=User):
    """Admin view for User model."""

    name = "User"
    name_plural = "Users"
    icon = "fa-solid fa-user"

    # Columns to display in list view
    column_list = [
        User.id,
        User.email,
        User.is_active,
        User.is_superuser,
        User.created_at,
    ]

    # Columns to search
    column_searchable_list = [User.email]

    # Default sort
    column_default_sort = [(User.created_at, True)]  # True = descending

    # Columns that are sortable
    column_sortable_list = [
        User.id,
        User.email,
        User.is_active,
        User.is_superuser,
        User.created_at,
    ]

    # Exclude password from forms
    form_excluded_columns = [User.hashed_password]

    # Make certain fields read-only
    form_readonly_columns = [User.created_at, User.updated_at]

    # Details view columns
    column_details_list = [
        User.id,
        User.email,
        User.is_active,
        User.is_superuser,
        User.created_at,
        User.updated_at,
    ]

    # Column formatters for human-readable display
    column_formatters = {
        User.is_active: _format_bool_yes,
        User.is_superuser: _format_bool_superuser,
    }

    # Column labels for better readability
    column_labels = {
        User.is_active: "Active",
        User.is_superuser: "Superuser",
    }
