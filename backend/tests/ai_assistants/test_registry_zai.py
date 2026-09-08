"""Тесты реестра AI-ассистентов: новые провайдеры zai/moonshot (2026-09-08).

Z.ai (GLM) и Moonshot (Kimi) добавлены по запросу владельца: подключение
по API-ключу с фронта /settings/ai-assistants, без дублирования UI —
форма строится из реестра автоматически.
"""

from __future__ import annotations

from app.modules.ai_assistants.registry import (
    AI_ASSISTANT_REGISTRY,
    get_registry_entry,
    get_settings_schema,
)


def test_zai_in_registry():
    e = get_registry_entry("zai")
    assert e is not None, "zai должен быть в реестре"
    assert e["name"] == "Z.ai (GLM)"
    assert "api_key" in e["config_keys"]
    assert "base_url" in e["config_keys"]


def test_zai_models_and_vision():
    e = get_registry_entry("zai")
    assert "glm-4.6" in e["model_examples"]
    # glm-4.6v — vision-вариант
    assert e["default_vision"]("glm-4.6v") is True
    assert e["default_vision"]("glm-4.6") is False
    assert e["default_vision"]("glm-4.5-air") is False


def test_zai_settings_schema():
    schema = get_settings_schema("zai")
    keys = [f["key"] for f in schema]
    assert keys == ["api_key", "base_url"]
    api_key_field = next(f for f in schema if f["key"] == "api_key")
    assert api_key_field["secret"] is True
    assert api_key_field["required"] is True


def test_moonshot_in_registry():
    e = get_registry_entry("moonshot")
    assert e is not None
    assert "api_key" in e["config_keys"]
    assert any("kimi" in m for m in e["model_examples"])


def test_registry_no_duplicates():
    pts = [p["provider_type"] for p in AI_ASSISTANT_REGISTRY]
    assert len(pts) == len(set(pts)), f"дубли provider_type: {pts}"


def test_registry_still_has_core_providers():
    # регрессия: старые провайдеры не потерялись
    for pt in ("openai", "anthropic", "google", "ollama", "openrouter", "other"):
        assert get_registry_entry(pt) is not None, pt


def test_client_dispatch_supports_new_providers():
    """zai/moonshot идут через OpenAI-совместимый путь (как groq/deepseek)."""
    import inspect

    from app.modules.ai_assistants import client

    chat_src = inspect.getsource(client.chat)
    assert '"zai"' in chat_src and '"moonshot"' in chat_src
    vision_src = inspect.getsource(client.vision)
    assert '"zai"' in vision_src and '"moonshot"' in vision_src


def test_client_default_base_urls():
    import inspect

    from app.modules.ai_assistants import client

    src = inspect.getsource(client._chat_openai_compatible)
    assert "https://api.z.ai/api/paas/v4" in src
    assert "https://api.moonshot.ai/v1" in src
