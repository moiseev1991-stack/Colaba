"""
Search admin view for SQLAdmin.
"""

from sqladmin import ModelView
from app.models.search import Search


def _format_query(model, prop):
    """Format query column."""
    if model.query and len(str(model.query)) > 80:
        return str(model.query)[:80] + "..."
    return model.query


def _format_status(model, prop):
    """Format status column."""
    status_map = {
        "pending": "Pending",
        "running": "Running",
        "completed": "Completed",
        "failed": "Failed",
        "cancelled": "Cancelled",
    }
    return status_map.get(model.status, model.status)


def _format_user(model, prop):
    """Format user relationship."""
    return str(model.user) if model.user else "-"


def _format_organization(model, prop):
    """Format organization relationship."""
    return str(model.organization) if model.organization else "-"


class SearchAdmin(ModelView, model=Search):
    """Admin view for Search model."""

    name = "Search"
    name_plural = "Searches"
    icon = "fa-solid fa-magnifying-glass"

    # Columns to display in list view
    column_list = [
        Search.id,
        Search.query,
        Search.status,
        Search.result_count,
        Search.user,
        Search.organization,
        Search.created_at,
    ]

    # Columns to search
    column_searchable_list = [Search.query]

    # Default sort
    column_default_sort = [(Search.created_at, True)]  # True = descending

    # Columns that are sortable
    column_sortable_list = [
        Search.id,
        Search.query,
        Search.status,
        Search.result_count,
        Search.created_at,
    ]

    # Make certain fields read-only
    form_readonly_columns = [Search.created_at, Search.updated_at]

    # Details view columns
    column_details_list = [
        Search.id,
        Search.query,
        Search.search_provider,
        Search.num_results,
        Search.status,
        Search.result_count,
        Search.config,
        Search.user,
        Search.organization,
        Search.created_at,
        Search.updated_at,
        Search.started_at,
        Search.finished_at,
    ]

    # Column formatters for human-readable display
    column_formatters = {
        Search.query: _format_query,
        Search.status: _format_status,
        Search.user: _format_user,
        Search.organization: _format_organization,
    }

    # Column labels for better readability
    column_labels = {
        Search.query: "Query",
        Search.result_count: "Results",
        Search.user: "User",
        Search.organization: "Organization",
        Search.search_provider: "Provider",
        Search.num_results: "Max Results",
    }
