"""
AI assistant admin view for SQLAdmin.
"""

from sqladmin import ModelView
from app.models.ai_assistant import AiAssistant


def _format_provider_type(model, prop):
    """Format provider type for display."""
    provider_names = {
        "openai": "OpenAI",
        "anthropic": "Anthropic",
        "google": "Google",
        "mistral": "Mistral",
        "ollama": "Ollama",
        "groq": "Groq",
        "together": "Together",
        "openrouter": "OpenRouter",
        "azure_openai": "Azure OpenAI",
        "xai": "xAI",
        "deepseek": "DeepSeek",
        "other": "Other",
    }
    return provider_names.get(model.provider_type, model.provider_type)


def _format_vision(model, prop):
    """Format boolean as Yes/No."""
    return "Yes" if model.supports_vision else "No"


def _format_default(model, prop):
    """Format boolean as Yes/No."""
    return "Yes" if model.is_default else "No"


def _format_config(model, prop):
    """Format config JSON for display."""
    if not model.config:
        return "{}"
    keys = list(model.config.keys())
    # Hide sensitive keys
    safe_keys = [k for k in keys if "key" not in k.lower() and "secret" not in k.lower()]
    if len(safe_keys) <= 3:
        return ", ".join(safe_keys) if safe_keys else "(hidden)"
    return ", ".join(safe_keys[:3]) + f" (+{len(safe_keys) - 3} more)"


class AiAssistantAdmin(ModelView, model=AiAssistant):
    """Admin view for AiAssistant model."""

    name = "AI Assistant"
    name_plural = "AI Assistants"
    icon = "fa-solid fa-robot"

    # Columns to display in list view
    column_list = [
        AiAssistant.id,
        AiAssistant.name,
        AiAssistant.provider_type,
        AiAssistant.model,
        AiAssistant.supports_vision,
        AiAssistant.is_default,
        AiAssistant.updated_at,
    ]

    # Columns to search
    column_searchable_list = [AiAssistant.name, AiAssistant.model]

    # Default sort
    column_default_sort = [(AiAssistant.updated_at, True)]  # True = descending

    # Columns that are sortable
    column_sortable_list = [
        AiAssistant.id,
        AiAssistant.name,
        AiAssistant.provider_type,
        AiAssistant.model,
        AiAssistant.supports_vision,
        AiAssistant.is_default,
        AiAssistant.updated_at,
    ]

    # Make certain fields read-only
    form_readonly_columns = [AiAssistant.updated_at]

    # Details view columns
    column_details_list = [
        AiAssistant.id,
        AiAssistant.name,
        AiAssistant.provider_type,
        AiAssistant.model,
        AiAssistant.config,
        AiAssistant.supports_vision,
        AiAssistant.is_default,
        AiAssistant.updated_at,
    ]

    # Column formatters for human-readable display
    column_formatters = {
        AiAssistant.provider_type: _format_provider_type,
        AiAssistant.supports_vision: _format_vision,
        AiAssistant.is_default: _format_default,
        AiAssistant.config: _format_config,
    }

    # Column labels for better readability
    column_labels = {
        AiAssistant.provider_type: "Provider",
        AiAssistant.supports_vision: "Vision",
        AiAssistant.is_default: "Default",
    }
