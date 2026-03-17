"""
Search result admin view for SQLAdmin.
"""

from sqladmin import ModelView
from app.models.search import SearchResult


def _format_title(model, prop):
    """Format title column."""
    if model.title and len(str(model.title)) > 60:
        return str(model.title)[:60] + "..."
    return model.title


def _format_url(model, prop):
    """Format URL column."""
    if model.url and len(str(model.url)) > 80:
        return str(model.url)[:80] + "..."
    return model.url


def _format_seo_score(model, prop):
    """Format SEO score."""
    if model.seo_score is not None:
        return f"{model.seo_score}/100"
    return "-"


def _format_contact_status(model, prop):
    """Format contact status."""
    if model.contact_status is None:
        return "-"
    status_map = {
        "found": "Found",
        "no_contacts": "No Contacts",
        "failed": "Failed",
        "pending": "Pending",
    }
    return status_map.get(model.contact_status, model.contact_status)


def _format_search(model, prop):
    """Format search relationship."""
    return str(model.search) if model.search else "-"


class SearchResultAdmin(ModelView, model=SearchResult):
    """Admin view for SearchResult model."""

    name = "Search Result"
    name_plural = "Search Results"
    icon = "fa-solid fa-list"

    # Columns to display in list view
    column_list = [
        SearchResult.id,
        SearchResult.title,
        SearchResult.domain,
        SearchResult.seo_score,
        SearchResult.contact_status,
        SearchResult.search,
        SearchResult.created_at,
    ]

    # Columns to search
    column_searchable_list = [SearchResult.title, SearchResult.url, SearchResult.domain]

    # Default sort
    column_default_sort = [(SearchResult.created_at, True)]  # True = descending

    # Columns that are sortable
    column_sortable_list = [
        SearchResult.id,
        SearchResult.position,
        SearchResult.domain,
        SearchResult.seo_score,
        SearchResult.contact_status,
        SearchResult.created_at,
    ]

    # Make certain fields read-only
    form_readonly_columns = [SearchResult.created_at]

    # Details view columns
    column_details_list = [
        SearchResult.id,
        SearchResult.search,
        SearchResult.position,
        SearchResult.title,
        SearchResult.url,
        SearchResult.domain,
        SearchResult.snippet,
        SearchResult.seo_score,
        SearchResult.phone,
        SearchResult.email,
        SearchResult.contact_status,
        SearchResult.outreach_subject,
        SearchResult.outreach_text,
        SearchResult.extra_data,
        SearchResult.created_at,
    ]

    # Column formatters for human-readable display
    column_formatters = {
        SearchResult.title: _format_title,
        SearchResult.url: _format_url,
        SearchResult.seo_score: _format_seo_score,
        SearchResult.contact_status: _format_contact_status,
        SearchResult.search: _format_search,
    }

    # Column labels for better readability
    column_labels = {
        SearchResult.seo_score: "SEO Score",
        SearchResult.contact_status: "Contacts",
        SearchResult.outreach_subject: "Outreach Subject",
        SearchResult.outreach_text: "Outreach Text",
        SearchResult.extra_data: "Extra Data",
    }
