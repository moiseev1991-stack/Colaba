"""Email campaign admin view for SQLAdmin."""

from sqladmin import ModelView
from app.models.email import EmailCampaign


def _format_status(model, prop):
    """Format campaign status."""
    status_map = {
        "draft": "Draft",
        "sending": "Sending",
        "completed": "Completed",
        "failed": "Failed",
    }
    return status_map.get(model.status, model.status)


def _format_user(model, prop):
    """Format user relationship."""
    return str(model.user) if model.user else "-"


def _format_organization(model, prop):
    """Format organization relationship."""
    return str(model.organization) if model.organization else "Global"


def _format_template(model, prop):
    """Format template relationship."""
    return str(model.template) if model.template else "-"


def _format_domain(model, prop):
    """Format domain relationship."""
    return str(model.domain) if model.domain else "-"


def _format_stats(model, prop):
    """Format delivery statistics."""
    return f"{model.delivered_count}/{model.sent_count} delivered"


class EmailCampaignAdmin(ModelView, model=EmailCampaign):
    """Admin view for EmailCampaign model."""

    name = "Email Campaign"
    name_plural = "Email Campaigns"
    icon = "fa-solid fa-bullhorn"

    # Columns to display in list view
    column_list = [
        EmailCampaign.id,
        EmailCampaign.name,
        EmailCampaign.status,
        EmailCampaign.total_recipients,
        EmailCampaign.sent_count,
        EmailCampaign.delivered_count,
        EmailCampaign.opened_count,
        EmailCampaign.bounced_count,
        EmailCampaign.user,
        EmailCampaign.organization,
        EmailCampaign.created_at,
    ]

    # Columns to search
    column_searchable_list = [EmailCampaign.name, EmailCampaign.subject]

    # Default sort
    column_default_sort = [(EmailCampaign.created_at, True)]  # True = descending

    # Columns that are sortable
    column_sortable_list = [
        EmailCampaign.id,
        EmailCampaign.name,
        EmailCampaign.status,
        EmailCampaign.total_recipients,
        EmailCampaign.sent_count,
        EmailCampaign.delivered_count,
        EmailCampaign.opened_count,
        EmailCampaign.bounced_count,
        EmailCampaign.created_at,
    ]

    # Make certain fields read-only
    form_readonly_columns = [
        EmailCampaign.created_at,
        EmailCampaign.updated_at,
        EmailCampaign.started_at,
        EmailCampaign.completed_at,
        EmailCampaign.total_recipients,
        EmailCampaign.sent_count,
        EmailCampaign.delivered_count,
        EmailCampaign.bounced_count,
        EmailCampaign.opened_count,
        EmailCampaign.clicked_count,
        EmailCampaign.spam_count,
        EmailCampaign.failed_count,
    ]

    # Details view columns
    column_details_list = [
        EmailCampaign.id,
        EmailCampaign.name,
        EmailCampaign.subject,
        EmailCampaign.body,
        EmailCampaign.status,
        EmailCampaign.template,
        EmailCampaign.domain,
        EmailCampaign.from_email,
        EmailCampaign.from_name,
        EmailCampaign.total_recipients,
        EmailCampaign.sent_count,
        EmailCampaign.delivered_count,
        EmailCampaign.opened_count,
        EmailCampaign.clicked_count,
        EmailCampaign.bounced_count,
        EmailCampaign.spam_count,
        EmailCampaign.failed_count,
        EmailCampaign.search_result_ids,
        EmailCampaign.user,
        EmailCampaign.organization,
        EmailCampaign.created_at,
        EmailCampaign.updated_at,
        EmailCampaign.started_at,
        EmailCampaign.completed_at,
    ]

    # Column formatters for human-readable display
    column_formatters = {
        EmailCampaign.status: _format_status,
        EmailCampaign.user: _format_user,
        EmailCampaign.organization: _format_organization,
        EmailCampaign.template: _format_template,
        EmailCampaign.domain: _format_domain,
    }

    # Column labels for better readability
    column_labels = {
        EmailCampaign.name: "Name",
        EmailCampaign.subject: "Subject",
        EmailCampaign.body: "Body",
        EmailCampaign.status: "Status",
        EmailCampaign.template: "Template",
        EmailCampaign.domain: "Domain",
        EmailCampaign.from_email: "From Email",
        EmailCampaign.from_name: "From Name",
        EmailCampaign.total_recipients: "Recipients",
        EmailCampaign.sent_count: "Sent",
        EmailCampaign.delivered_count: "Delivered",
        EmailCampaign.opened_count: "Opened",
        EmailCampaign.clicked_count: "Clicked",
        EmailCampaign.bounced_count: "Bounced",
        EmailCampaign.spam_count: "Spam",
        EmailCampaign.failed_count: "Failed",
        EmailCampaign.search_result_ids: "Search Results",
        EmailCampaign.user: "Owner",
        EmailCampaign.organization: "Organization",
        EmailCampaign.started_at: "Started At",
        EmailCampaign.completed_at: "Completed At",
    }

    # Form columns - exclude relationships from form
    form_excluded_columns = [EmailCampaign.logs]
