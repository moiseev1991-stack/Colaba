"""
Captcha bypass config admin view for SQLAdmin.
"""

from sqladmin import ModelView
from app.models.captcha_bypass_config import CaptchaBypassConfig


def _format_ai_assistant(model, prop):
    """Format AI assistant relationship."""
    if model.ai_assistant:
        return str(model.ai_assistant)
    return "Not set"


def _format_external_services(model, prop):
    """Format external services config for display."""
    if not model.external_services:
        return "None configured"
    
    enabled = []
    for service, config in model.external_services.items():
        if isinstance(config, dict) and config.get("enabled"):
            enabled.append(service)
    
    if not enabled:
        return "None enabled"
    
    service_names = {
        "2captcha": "2Captcha",
        "anticaptcha": "Anti-Captcha",
    }
    
    return ", ".join([service_names.get(s, s) for s in enabled])


class CaptchaBypassConfigAdmin(ModelView, model=CaptchaBypassConfig):
    """Admin view for CaptchaBypassConfig model."""

    name = "Captcha Bypass Config"
    name_plural = "Captcha Bypass Configs"
    icon = "fa-solid fa-shield-halved"

    # Columns to display in list view
    column_list = [
        CaptchaBypassConfig.id,
        CaptchaBypassConfig.ai_assistant_id,
        CaptchaBypassConfig.updated_at,
    ]

    # Default sort
    column_default_sort = [(CaptchaBypassConfig.updated_at, True)]  # True = descending

    # Columns that are sortable
    column_sortable_list = [
        CaptchaBypassConfig.id,
        CaptchaBypassConfig.ai_assistant_id,
        CaptchaBypassConfig.updated_at,
    ]

    # Make certain fields read-only
    form_readonly_columns = [CaptchaBypassConfig.updated_at]

    # Details view columns
    column_details_list = [
        CaptchaBypassConfig.id,
        CaptchaBypassConfig.ai_assistant_id,
        CaptchaBypassConfig.external_services,
        CaptchaBypassConfig.updated_at,
    ]

    # Column formatters for human-readable display
    column_formatters = {
        CaptchaBypassConfig.ai_assistant_id: _format_ai_assistant,
        CaptchaBypassConfig.external_services: _format_external_services,
    }

    # Column labels for better readability
    column_labels = {
        CaptchaBypassConfig.ai_assistant_id: "AI Assistant",
        CaptchaBypassConfig.external_services: "External Services",
    }
