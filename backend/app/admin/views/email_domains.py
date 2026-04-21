"""Email domain admin view for SQLAdmin - DKIM/SPF/DMARC management."""

from sqladmin import ModelView
from app.models.email import EmailDomain


def _format_dns_status(model, prop):
    """Format DNS status with color indicator."""
    status = getattr(model, prop.key) if hasattr(model, prop.key) else None
    if status == "verified":
        return "Verified"
    elif status == "failed":
        return "Failed"
    return "Pending"


def _format_organization(model, prop):
    """Format organization relationship."""
    return str(model.organization) if model.organization else "Global"


def _format_verification(model, prop):
    """Show overall verification status."""
    if (model.dkim_status == "verified" and 
        model.spf_status == "verified" and 
        model.dmarc_status == "verified"):
        return "Fully Verified"
    elif (model.dkim_status == "verified" or 
          model.spf_status == "verified"):
        return "Partially Verified"
    return "Not Verified"


class EmailDomainAdmin(ModelView, model=EmailDomain):
    """Admin view for EmailDomain model - DKIM/SPF/DMARC management."""

    name = "Email Domain"
    name_plural = "Email Domains"
    icon = "fa-solid fa-globe"

    # Columns to display in list view
    column_list = [
        EmailDomain.id,
        EmailDomain.domain,
        EmailDomain.dkim_status,
        EmailDomain.spf_status,
        EmailDomain.dmarc_status,
        EmailDomain.default_from_email,
        EmailDomain.is_active,
        EmailDomain.organization,
        EmailDomain.created_at,
    ]

    # Columns to search
    column_searchable_list = [EmailDomain.domain, EmailDomain.default_from_email]

    # Default sort
    column_default_sort = [(EmailDomain.created_at, True)]  # True = descending

    # Columns that are sortable
    column_sortable_list = [
        EmailDomain.id,
        EmailDomain.domain,
        EmailDomain.dkim_status,
        EmailDomain.spf_status,
        EmailDomain.dmarc_status,
        EmailDomain.is_active,
        EmailDomain.created_at,
    ]

    # Make certain fields read-only
    form_readonly_columns = [
        EmailDomain.created_at,
        EmailDomain.updated_at,
        EmailDomain.verified_at,
    ]

    # Details view columns
    column_details_list = [
        EmailDomain.id,
        EmailDomain.domain,
        EmailDomain.dkim_status,
        EmailDomain.spf_status,
        EmailDomain.dmarc_status,
        EmailDomain.dkim_record,
        EmailDomain.spf_record,
        EmailDomain.dmarc_record,
        EmailDomain.default_from_email,
        EmailDomain.default_from_name,
        EmailDomain.is_active,
        EmailDomain.organization,
        EmailDomain.created_at,
        EmailDomain.updated_at,
        EmailDomain.verified_at,
    ]

    # Column formatters for human-readable display
    column_formatters = {
        EmailDomain.dkim_status: _format_dns_status,
        EmailDomain.spf_status: _format_dns_status,
        EmailDomain.dmarc_status: _format_dns_status,
        EmailDomain.organization: _format_organization,
    }

    # Column labels for better readability
    column_labels = {
        EmailDomain.domain: "Domain",
        EmailDomain.dkim_status: "DKIM",
        EmailDomain.spf_status: "SPF",
        EmailDomain.dmarc_status: "DMARC",
        EmailDomain.dkim_record: "DKIM Record",
        EmailDomain.spf_record: "SPF Record",
        EmailDomain.dmarc_record: "DMARC Record",
        EmailDomain.default_from_email: "From Email",
        EmailDomain.default_from_name: "From Name",
        EmailDomain.is_active: "Active",
        EmailDomain.organization: "Organization",
        EmailDomain.verified_at: "Verified At",
    }

    # Form columns - exclude relationships from form
    form_excluded_columns = []
