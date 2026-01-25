"""AI Assistants: CRUD, registry, LLM client (chat, vision)."""

from app.modules.ai_assistants.registry import AI_ASSISTANT_REGISTRY, get_registry_entry, get_settings_schema
from app.modules.ai_assistants import service
from app.modules.ai_assistants.client import chat, vision

__all__ = [
    "AI_ASSISTANT_REGISTRY",
    "get_registry_entry",
    "get_settings_schema",
    "service",
    "chat",
    "vision",
]
