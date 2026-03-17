"""
Deployment admin view for SQLAdmin.
"""

from sqladmin import ModelView
from app.models.deployment import Deployment, DeploymentEnvironment, DeploymentStatus


def _format_changelog(model, prop):
    """Truncate long changelog."""
    if model.changelog and len(model.changelog) > 200:
        return model.changelog[:200] + "..."
    return model.changelog


def _format_environment(model, prop):
    """Format deployment environment."""
    if model.environment is None:
        return "-"
    env_map = {
        DeploymentEnvironment.staging: "Staging",
        DeploymentEnvironment.production: "Production",
    }
    return env_map.get(model.environment, str(model.environment))


def _format_deployment_status(model, prop):
    """Format deployment status."""
    if model.status is None:
        return "-"
    status_map = {
        DeploymentStatus.success: "Success",
        DeploymentStatus.failed: "Failed",
        DeploymentStatus.rolled_back: "Rolled Back",
    }
    return status_map.get(model.status, str(model.status))


class DeploymentAdmin(ModelView, model=Deployment):
    """Admin view for Deployment model."""

    name = "Deployment"
    name_plural = "Deployments"
    icon = "fa-solid fa-rocket"

    # Columns to display in list view
    column_list = [
        Deployment.id,
        Deployment.version,
        Deployment.git_sha,
        Deployment.environment,
        Deployment.status,
        Deployment.deployed_at,
        Deployment.deployed_by,
    ]

    # Columns to search
    column_searchable_list = [Deployment.version, Deployment.git_sha]

    # Default sort
    column_default_sort = [(Deployment.deployed_at, True)]  # True = descending

    # Columns that are sortable
    column_sortable_list = [
        Deployment.id,
        Deployment.version,
        Deployment.git_sha,
        Deployment.environment,
        Deployment.status,
        Deployment.deployed_at,
    ]

    # Make certain fields read-only
    form_readonly_columns = [Deployment.deployed_at]

    # Details view columns
    column_details_list = [
        Deployment.id,
        Deployment.version,
        Deployment.git_sha,
        Deployment.environment,
        Deployment.changelog,
        Deployment.status,
        Deployment.deployed_at,
        Deployment.deployed_by,
    ]

    # Column formatters for human-readable display
    column_formatters = {
        Deployment.changelog: _format_changelog,
        Deployment.environment: _format_environment,
        Deployment.status: _format_deployment_status,
    }

    # Column labels for better readability
    column_labels = {
        Deployment.git_sha: "Git SHA",
        Deployment.deployed_at: "Deployed At",
        Deployment.deployed_by: "Deployed By",
    }
