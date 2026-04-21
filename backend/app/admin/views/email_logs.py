"""Email log admin view for SQLAdmin - read-only delivery tracking."""

from sqladmin import ModelView
from app.models.email import EmailLog


def _format_status(model, prop):
    """Format email status."""
    status_map = {
        "pending": "Pending",
        "sent": "Sent",
        "delivered": "Delivered",
        "bounced": "Bounced",
        "opened": "Opened",
        "clicked": "Clicked",
        "spam": "Spam",
        "failed": "Failed",
    }
    return status_map.get(model.status, model.status)


def _format_campaign(model, prop):
    """Format campaign relationship."""
    return str(model.campaign) if model.campaign else "-"


def _format_user(model, prop):
    """Format user relationship."""
    return str(model.user) if model.user else "-"


def _format_organization(model, prop):
    """Format organization relationship."""
    return str(model.organization) if model.organization else "-"


class EmailLogAdmin(ModelView, model=EmailLog):
    """Admin view for EmailLog model - read-only delivery tracking."""

    name = "Email Log"
    name_plural = "Email Logs"
    icon = "fa-solid fa-list-check"

    # Columns to display in list view
    column_list = [
        EmailLog.id,
        EmailLog.to_email,
        EmailLog.subject,
        EmailLog.status,
        EmailLog.campaign,
        EmailLog.external_message_id,
        EmailLog.user,
        EmailLog.organization,
        EmailLog.created_at,
        EmailLog.sent_at,
    ]

    # Columns to search
    column_searchable_list = [
        EmailLog.to_email,
        EmailLog.subject,
        EmailLog.external_message_id,
    ]

    # Default sort
    column_default_sort = [(EmailLog.created_at, True)]  # True = descending

    # Columns that are sortable
    column_sortable_list = [
        EmailLog.id,
        EmailLog.to_email,
        EmailLog.status,
        EmailLog.created_at,
        EmailLog.sent_at,
        EmailLog.delivered_at,
        EmailLog.opened_at,
    ]

    # Make all fields read-only - this is a log table
    form_readonly_columns = [
        EmailLog.id,
        EmailLog.campaign_id,
        EmailLog.search_result_id,
        EmailLog.organization_id,
        EmailLog.user_id,
        EmailLog.to_email,
        EmailLog.to_name,
        EmailLog.subject,
        EmailLog.body_preview,
        EmailLog.status,
        EmailLog.external_message_id,
        EmailLog.error_message,
        EmailLog.error_code,
        EmailLog.created_at,
        EmailLog.sent_at,
        EmailLog.delivered_at,
        EmailLog.opened_at,
        EmailLog.clicked_at,
        EmailLog.bounced_at,
        EmailLog.extra_data,
    ]

    # Details view columns
    column_details_list = [
        EmailLog.id,
        EmailLog.to_email,
        EmailLog.to_name,
        EmailLog.subject,
        EmailLog.body_preview,
        EmailLog.status,
        EmailLog.external_message_id,
        EmailLog.error_message,
        EmailLog.error_code,
        EmailLog.campaign,
        EmailLog.search_result_id,
        EmailLog.user,
        EmailLog.organization,
        EmailLog.created_at,
        EmailLog.sent_at,
        EmailLog.delivered_at,
        EmailLog.opened_at,
        EmailLog.clicked_at,
        EmailLog.bounced_at,
        EmailLog.extra_data,
    ]

    # Column formatters for human-readable display
    column_formatters = {
        EmailLog.status: _format_status,
        EmailLog.campaign: _format_campaign,
        EmailLog.user: _format_user,
        EmailLog.organization: _format_organization,
    }

    # Column labels for better readability
    column_labels = {
        EmailLog.to_email: "To Email",
        EmailLog.to_name: "To Name",
        EmailLog.subject: "Subject",
        EmailLog.body_preview: "Body Preview",
        EmailLog.status: "Status",
        EmailLog.external_message_id: "Message ID",
        EmailLog.error_message: "Error",
        EmailLog.error_code: "Error Code",
        EmailLog.campaign: "Campaign",
        EmailLog.search_result_id: "Search Result",
        EmailLog.user: "Owner",
        EmailLog.organization: "Organization",
        EmailLog.sent_at: "Sent At",
        EmailLog.delivered_at: "Delivered At",
        EmailLog.opened_at: "Opened At",
        EmailLog.clicked_at: "Clicked At",
        EmailLog.bounced_at: "Bounced At",
        EmailLog.extra_data: "Extra Data",
    }

    # Disable create/edit/delete - this is a log table
    can_create = False
    can_edit = False
    can_delete = True  # Allow deletion for cleanup
