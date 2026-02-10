"""
Реестр предустановленных провайдеров AI: provider_type, описание, config-поля, примеры моделей, supports_vision по умолчанию.
"""

AI_ASSISTANT_REGISTRY: list[dict] = [
    {
        "provider_type": "openai",
        "name": "OpenAI",
        "config_keys": ["api_key", "base_url", "organization"],
        "model_examples": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
        "default_vision": lambda m: (m or "").startswith("gpt-4o") or "vision" in (m or "").lower(),
    },
    {
        "provider_type": "anthropic",
        "name": "Anthropic",
        "config_keys": ["api_key"],
        "model_examples": ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229"],
        "default_vision": lambda m: "claude-3" in (m or "").lower() or "claude-3-5" in (m or "").lower(),
    },
    {
        "provider_type": "google",
        "name": "Google (Gemini)",
        "config_keys": ["api_key"],
        "model_examples": ["gemini-2.0-flash", "gemini-1.5-pro"],
        "default_vision": lambda m: "gemini" in (m or "").lower(),
    },
    {
        "provider_type": "mistral",
        "name": "Mistral",
        "config_keys": ["api_key", "base_url"],
        "model_examples": ["mistral-large-latest", "pixtral-12b-2409"],
        "default_vision": lambda m: "pixtral" in (m or "").lower(),
    },
    {
        "provider_type": "ollama",
        "name": "Ollama",
        "config_keys": ["base_url"],
        "model_examples": ["llava", "llama3.2-vision", "llama3.2"],
        "default_vision": lambda m: "llava" in (m or "").lower() or "vision" in (m or "").lower(),
    },
    {
        "provider_type": "groq",
        "name": "Groq",
        "config_keys": ["api_key"],
        "model_examples": ["llama-3.1-70b-versatile", "mixtral-8x7b-32768"],
        "default_vision": lambda m: False,
    },
    {
        "provider_type": "together",
        "name": "Together",
        "config_keys": ["api_key", "base_url"],
        "model_examples": ["meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo"],
        "default_vision": lambda m: "vision" in (m or "").lower(),
    },
    {
        "provider_type": "openrouter",
        "name": "OpenRouter",
        "config_keys": ["api_key", "base_url"],
        "model_examples": ["openai/gpt-4o", "anthropic/claude-3.5-sonnet"],
        "default_vision": lambda m: "gpt-4o" in (m or "").lower() or "claude-3" in (m or "").lower() or "vision" in (m or "").lower(),
    },
    {
        "provider_type": "azure_openai",
        "name": "Azure OpenAI",
        "config_keys": ["api_key", "base_url", "api_version", "deployment_name"],
        "model_examples": [],
        "default_vision": lambda m: True,
    },
    {
        "provider_type": "xai",
        "name": "xAI (Grok)",
        "config_keys": ["api_key", "base_url"],
        "model_examples": ["grok-2", "grok-2-vision"],
        "default_vision": lambda m: "vision" in (m or "").lower(),
    },
    {
        "provider_type": "deepseek",
        "name": "DeepSeek",
        "config_keys": ["api_key", "base_url"],
        "model_examples": ["deepseek-chat", "deepseek-reasoner"],
        "default_vision": lambda m: "vision" in (m or "").lower(),
    },
    {
        "provider_type": "other",
        "name": "Other (OpenAI‑compatible)",
        "config_keys": ["api_key", "base_url", "model"],
        "model_examples": [],
        "default_vision": lambda m: False,
    },
]


def get_registry_entry(provider_type: str) -> dict | None:
    for p in AI_ASSISTANT_REGISTRY:
        if p["provider_type"] == provider_type:
            return p
    return None


def get_settings_schema(provider_type: str) -> list[dict]:
    """Поля для формы по provider_type: key, label, type, required, secret."""
    entry = get_registry_entry(provider_type)
    if not entry:
        return []
    keys = entry.get("config_keys", [])
    schemas = {
        "api_key": {"key": "api_key", "label": "API Key", "type": "string", "required": True, "secret": True},
        "base_url": {"key": "base_url", "label": "Base URL", "type": "string", "required": False, "secret": False},
        "organization": {"key": "organization", "label": "Organization", "type": "string", "required": False, "secret": False},
        "api_version": {"key": "api_version", "label": "API Version", "type": "string", "required": False, "secret": False},
        "deployment_name": {"key": "deployment_name", "label": "Deployment Name", "type": "string", "required": True, "secret": False},
        "model": {"key": "model", "label": "Model", "type": "string", "required": False, "secret": False},
    }
    out = []
    for k in keys:
        if k in schemas:
            out.append(schemas[k])
    return out
