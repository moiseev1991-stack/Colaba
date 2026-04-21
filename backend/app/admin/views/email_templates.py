"""Email template admin view for SQLAdmin."""

from sqladmin import ModelView
from app.models.email import EmailTemplate


def _format_body(model, prop):
    """Format body column - show first 100 chars."""
    if model.body and len(str(model.body)) > 100:
        return str(model.body)[:100] + "..."
    return model.body or ""


def _format_user(model, prop):
    """Format user relationship."""
    return str(model.user) if model.user else "-"


def _format_organization(model, prop):
    """Format organization relationship."""
    return str(model.organization) if model.organization else "Global"


class EmailTemplateAdmin(ModelView, model=EmailTemplate):
    """Admin view for EmailTemplate model."""

    name = "Email Template"
    name_plural = "Email Templates"
    icon = "fa-solid fa-envelope-open-text"

    # Columns to display in list view
    column_list = [
        EmailTemplate.id,
        EmailTemplate.name,
        EmailTemplate.subject,
        EmailTemplate.module,
        EmailTemplate.is_default,
        EmailTemplate.is_active,
        EmailTemplate.user,
        EmailTemplate.organization,
        EmailTemplate.created_at,
    ]

    # Columns to search
    column_searchable_list = [EmailTemplate.name, EmailTemplate.subject, EmailTemplate.body]

    # Default sort
    column_default_sort = [(EmailTemplate.created_at, True)]  # True = descending

    # Columns that are sortable
    column_sortable_list = [
        EmailTemplate.id,
        EmailTemplate.name,
        EmailTemplate.module,
        EmailTemplate.is_default,
        EmailTemplate.is_active,
        EmailTemplate.created_at,
    ]

    # Make certain fields read-only
    form_readonly_columns = [EmailTemplate.created_at, EmailTemplate.updated_at]

    # Details view columns
    column_details_list = [
        EmailTemplate.id,
        EmailTemplate.name,
        EmailTemplate.subject,
        EmailTemplate.body,
        EmailTemplate.module,
        EmailTemplate.is_default,
        EmailTemplate.is_active,
        EmailTemplate.variables,
        EmailTemplate.user,
        EmailTemplate.organization,
        EmailTemplate.created_at,
        EmailTemplate.updated_at,
    ]

    # Column formatters for human-readable display
    column_formatters = {
        EmailTemplate.body: _format_body,
        EmailTemplate.user: _format_user,
        EmailTemplate.organization: _format_organization,
    }

    # Column labels for better readability
    column_labels = {
        EmailTemplate.name: "Name",
        EmailTemplate.subject: "Subject",
        EmailTemplate.body: "Body",
        EmailTemplate.module: "Module",
        EmailTemplate.is_default: "Default",
        EmailTemplate.is_active: "Active",
        EmailTemplate.user: "Owner",
        EmailTemplate.organization: "Organization",
        EmailTemplate.variables: "Variables",
    }

    # Form columns - exclude relationships from form
    form_excluded_columns = [EmailTemplate.campaigns]
