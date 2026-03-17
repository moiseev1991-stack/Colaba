"""
Search provider config admin view for SQLAdmin.
"""

from sqladmin import ModelView
from app.models.search_provider_config import SearchProviderConfig


def _format_provider_name(model, prop):
    """Format provider name for display."""
    provider_names = {
        "duckduckgo": "DuckDuckGo",
        "yandex_html": "Yandex (HTML)",
        "google_html": "Google (HTML)",
        "yandex_xml": "Yandex (XML)",
        "serpapi": "SerpAPI",
    }
    return provider_names.get(model.provider_id, model.provider_id)


def _format_config(model, prop):
    """Format config JSON for display."""
    if not model.config:
        return "{}"
    keys = list(model.config.keys())
    if len(keys) <= 3:
        return ", ".join(keys)
    return ", ".join(keys[:3]) + f" (+{len(keys) - 3} more)"


class SearchProviderConfigAdmin(ModelView, model=SearchProviderConfig):
    """Admin view for SearchProviderConfig model."""

    name = "Search Provider Config"
    name_plural = "Search Provider Configs"
    icon = "fa-solid fa-server"

    # Columns to display in list view
    column_list = [
        SearchProviderConfig.id,
        SearchProviderConfig.provider_id,
        SearchProviderConfig.updated_at,
    ]

    # Columns to search
    column_searchable_list = [SearchProviderConfig.provider_id]

    # Default sort
    column_default_sort = [(SearchProviderConfig.updated_at, True)]  # True = descending

    # Columns that are sortable
    column_sortable_list = [
        SearchProviderConfig.id,
        SearchProviderConfig.provider_id,
        SearchProviderConfig.updated_at,
    ]

    # Make certain fields read-only
    form_readonly_columns = [SearchProviderConfig.updated_at]

    # Details view columns
    column_details_list = [
        SearchProviderConfig.id,
        SearchProviderConfig.provider_id,
        SearchProviderConfig.config,
        SearchProviderConfig.updated_at,
    ]

    # Column formatters for human-readable display
    column_formatters = {
        SearchProviderConfig.provider_id: _format_provider_name,
        SearchProviderConfig.config: _format_config,
    }

    # Column labels for better readability
    column_labels = {
        SearchProviderConfig.provider_id: "Provider",
        SearchProviderConfig.config: "Configuration",
    }
