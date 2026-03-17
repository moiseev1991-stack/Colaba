"""
Organization admin view for SQLAdmin.
"""

from sqladmin import ModelView
from app.models.organization import Organization


class OrganizationAdmin(ModelView, model=Organization):
    """Admin view for Organization model."""

    name = "Organization"
    name_plural = "Organizations"
    icon = "fa-solid fa-building"

    # Columns to display in list view
    column_list = [
        Organization.id,
        Organization.name,
        Organization.created_at,
    ]

    # Columns to search
    column_searchable_list = [Organization.name]

    # Default sort
    column_default_sort = [(Organization.created_at, True)]  # True = descending

    # Columns that are sortable
    column_sortable_list = [
        Organization.id,
        Organization.name,
        Organization.created_at,
    ]

    # Make certain fields read-only
    form_readonly_columns = [Organization.created_at, Organization.updated_at]

    # Details view columns
    column_details_list = [
        Organization.id,
        Organization.name,
        Organization.created_at,
        Organization.updated_at,
    ]

    # Column labels for better readability
    column_labels = {
        Organization.name: "Name",
    }
