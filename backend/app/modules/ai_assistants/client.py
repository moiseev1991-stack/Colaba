"""
Универсальный вызов AI: chat(assistant_id, messages, db) и vision(assistant_id, image_b64, prompt, db).
По provider_type выбирается адаптер (OpenAI, Anthropic, Google, Ollama, OpenAI‑compatible).
"""

import base64
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ai_assistants.service import get_ai_assistant_row

logger = logging.getLogger(__name__)


async def _get_assistant(assistant_id: int, db: AsyncSession):
    row = await get_ai_assistant_row(assistant_id, db)
    if not row:
        raise ValueError(f"AI assistant {assistant_id} not found")
    return row


def _cfg(row, key: str, default: str = "") -> str:
    return str((row.config or {}).get(key) or default).strip()


async def chat(
    assistant_id: int,
    messages: list[dict[str, Any]],
    db: AsyncSession,
    *,
    max_tokens: int = 1024,
    temperature: float = 0.7,
) -> str:
    """
    Универсальный чат по assistant_id. Возвращает строку (ответ модели).
    """
    row = await _get_assistant(assistant_id, db)
    pt = (row.provider_type or "").lower()
    model = row.model or ""
    cfg = dict(row.config or {})

    if pt == "openai":
        return await _chat_openai(model, cfg, messages, max_tokens, temperature)
    if pt == "ollama":
        return await _chat_ollama(model, cfg, messages, max_tokens, temperature)
    if pt == "anthropic":
        return await _chat_anthropic(model, cfg, messages, max_tokens, temperature)
    if pt == "google":
        return await _chat_google(model, cfg, messages, max_tokens, temperature)
    if pt in ("groq", "together", "openrouter", "deepseek", "xai", "mistral"):
        return await _chat_openai_compatible(pt, model, cfg, messages, max_tokens, temperature)
    if pt == "azure_openai":
        return await _chat_azure_openai(cfg, model, messages, max_tokens, temperature)
    if pt == "other":
        return await _chat_openai_compatible("other", model, cfg, messages, max_tokens, temperature)
    raise ValueError(f"Unsupported provider_type: {pt}")


async def vision(assistant_id: int, image_b64: str, prompt: str, db: AsyncSession) -> str:
    """
    Vision: отправить изображение (base64) и текстовый prompt, вернуть распознанный текст.
    """
    row = await _get_assistant(assistant_id, db)
    pt = (row.provider_type or "").lower()
    model = row.model or ""
    cfg = dict(row.config or {})

    if pt == "openai":
        return await _vision_openai(model, cfg, image_b64, prompt)
    if pt == "ollama":
        return await _vision_ollama(model, cfg, image_b64, prompt)
    if pt == "anthropic":
        return await _vision_anthropic(model, cfg, image_b64, prompt)
    if pt == "google":
        return await _vision_google(model, cfg, image_b64, prompt)
    if pt in ("groq", "together", "openrouter", "deepseek", "xai", "mistral", "other"):
        return await _vision_openai_compatible(model, cfg, image_b64, prompt)
    if pt == "azure_openai":
        return await _vision_azure_openai(cfg, model, image_b64, prompt)
    raise ValueError(f"Unsupported provider_type for vision: {pt}")


# --- OpenAI ---
async def _chat_openai(model: str, cfg: dict, messages: list, max_tokens: int, temperature: float) -> str:
    from openai import AsyncOpenAI

    api_key = cfg.get("api_key") or ""
    base_url = cfg.get("base_url") or None
    org = cfg.get("organization") or None
    c = AsyncOpenAI(api_key=api_key, base_url=base_url, organization=org)
    r = await c.chat.completions.create(model=model, messages=messages, max_tokens=max_tokens, temperature=temperature)
    return (r.choices[0].message.content or "").strip()


async def _vision_openai(model: str, cfg: dict, image_b64: str, prompt: str) -> str:
    from openai import AsyncOpenAI

    api_key = cfg.get("api_key") or ""
    base_url = cfg.get("base_url") or None
    org = cfg.get("organization") or None
    c = AsyncOpenAI(api_key=api_key, base_url=base_url, organization=org)
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}},
                {"type": "text", "text": prompt or "Напиши только текст с картинки, без кавычек и пояснений."},
            ],
        }
    ]
    r = await c.chat.completions.create(model=model, messages=messages, max_tokens=512)
    return (r.choices[0].message.content or "").strip()


# --- Ollama (httpx) ---
async def _chat_ollama(model: str, cfg: dict, messages: list, max_tokens: int, temperature: float) -> str:
    import httpx

    base = (cfg.get("base_url") or "http://localhost:11434").rstrip("/")
    async with httpx.AsyncClient(timeout=120.0) as client:
        r = await client.post(
            f"{base}/api/chat",
            json={"model": model, "messages": messages, "options": {"num_predict": max_tokens, "temperature": temperature}},
        )
        r.raise_for_status()
        data = r.json()
    return (data.get("message", {}).get("content") or "").strip()


async def _vision_ollama(model: str, cfg: dict, image_b64: str, prompt: str) -> str:
    import httpx

    base = (cfg.get("base_url") or "http://localhost:11434").rstrip("/")
    content = [
        {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": image_b64}},
        {"type": "text", "text": prompt or "Напиши только текст с картинки, без кавычек и пояснений."},
    ]
    async with httpx.AsyncClient(timeout=120.0) as client:
        r = await client.post(
            f"{base}/api/chat",
            json={"model": model, "messages": [{"role": "user", "content": content}]},
        )
        r.raise_for_status()
        data = r.json()
    return (data.get("message", {}).get("content") or "").strip()


# --- Anthropic ---
async def _chat_anthropic(model: str, cfg: dict, messages: list, max_tokens: int, temperature: float) -> str:
    from anthropic import AsyncAnthropic

    api_key = cfg.get("api_key") or ""
    c = AsyncAnthropic(api_key=api_key)
    # Anthropic: system + user/assistant. We map messages to the last user and prior assistant.
    system = ""
    last = []
    for m in messages:
        role = (m.get("role") or "user").lower()
        cont = m.get("content") or ""
        if isinstance(cont, list):
            cont = " ".join(str(x.get("text", x)) if isinstance(x, dict) else str(x) for x in cont)
        if role == "system":
            system = cont
        else:
            last.append({"role": "user" if role == "user" else "assistant", "content": cont})
    if not last:
        return ""
    req = {"model": model, "max_tokens": max_tokens, "messages": last}
    if system:
        req["system"] = system
    msg = await c.messages.create(**req)
    return (msg.content[0].text if msg.content else "").strip()


async def _vision_anthropic(model: str, cfg: dict, image_b64: str, prompt: str) -> str:
    from anthropic import AsyncAnthropic

    api_key = cfg.get("api_key") or ""
    c = AsyncAnthropic(api_key=api_key)
    content = [
        {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": image_b64}},
        {"type": "text", "text": prompt or "Напиши только текст с картинки, без кавычек и пояснений."},
    ]
    msg = await c.messages.create(model=model, max_tokens=512, messages=[{"role": "user", "content": content}])
    return (msg.content[0].text if msg.content else "").strip()


# --- Google ---
async def _chat_google(model: str, cfg: dict, messages: list, max_tokens: int, temperature: float) -> str:
    import google.generativeai as genai

    genai.configure(api_key=cfg.get("api_key") or "")
    m = genai.GenerativeModel(model)
    # google: content is str or list of Parts. For history we'd need to build.
    last_user = next((m["content"] for m in reversed(messages) if (m.get("role") or "").lower() == "user"), "")
    if isinstance(last_user, list):
        last_user = " ".join(str(x.get("text", x)) if isinstance(x, dict) else str(x) for x in last_user)
    r = await m.generate_content_async(last_user, generation_config=genai.types.GenerationConfig(max_output_tokens=max_tokens, temperature=temperature))
    return (r.text or "").strip()


async def _vision_google(model: str, cfg: dict, image_b64: str, prompt: str) -> str:
    import google.generativeai as genai

    genai.configure(api_key=cfg.get("api_key") or "")
    m = genai.GenerativeModel(model)
    img_part = {"inline_data": {"mime_type": "image/png", "data": base64.b64decode(image_b64)}}
    r = await m.generate_content_async([prompt or "Напиши только текст с картинки, без кавычек и пояснений.", img_part])
    return (r.text or "").strip()


# --- OpenAI‑compatible (Groq, Together, OpenRouter, DeepSeek, xAI, Mistral, other) ---
async def _chat_openai_compatible(
    _pt: str, model: str, cfg: dict, messages: list, max_tokens: int, temperature: float
) -> str:
    from openai import AsyncOpenAI

    api_key = cfg.get("api_key") or ""
    base_url = cfg.get("base_url")
    if not base_url and _pt == "groq":
        base_url = "https://api.groq.com/openai/v1"
    if not base_url and _pt == "together":
        base_url = "https://api.together.xyz/v1"
    if not base_url and _pt == "openrouter":
        base_url = "https://openrouter.ai/api/v1"
    if not base_url and _pt == "deepseek":
        base_url = "https://api.deepseek.com"
    if not base_url and _pt == "xai":
        base_url = "https://api.x.ai/v1"
    c = AsyncOpenAI(api_key=api_key, base_url=base_url)
    r = await c.chat.completions.create(model=model, messages=messages, max_tokens=max_tokens, temperature=temperature)
    return (r.choices[0].message.content or "").strip()


async def _vision_openai_compatible(model: str, cfg: dict, image_b64: str, prompt: str) -> str:
    from openai import AsyncOpenAI

    api_key = cfg.get("api_key") or ""
    base_url = cfg.get("base_url")
    c = AsyncOpenAI(api_key=api_key, base_url=base_url)
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}},
                {"type": "text", "text": prompt or "Напиши только текст с картинки, без кавычек и пояснений."},
            ],
        }
    ]
    r = await c.chat.completions.create(model=model, messages=messages, max_tokens=512)
    return (r.choices[0].message.content or "").strip()


# --- Azure OpenAI ---
def _azure_base_url(cfg: dict) -> str:
    # base_url can be https://xxx.openai.azure.com
    base = (cfg.get("base_url") or "").rstrip("/")
    dep = cfg.get("deployment_name") or ""
    ver = cfg.get("api_version") or "2024-02-15-preview"
    if not base or not dep:
        raise ValueError("Azure OpenAI requires base_url and deployment_name in config")
    return f"{base}/openai/deployments/{dep}/chat/completions?api-version={ver}"


async def _chat_azure_openai(cfg: dict, _model: str, messages: list, max_tokens: int, temperature: float) -> str:
    import httpx

    url = _azure_base_url(cfg)
    api_key = cfg.get("api_key") or ""
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            url,
            headers={"Content-Type": "application/json", "api-key": api_key},
            json={"messages": messages, "max_tokens": max_tokens, "temperature": temperature},
        )
        r.raise_for_status()
        data = r.json()
    return (data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()


async def _vision_azure_openai(cfg: dict, _model: str, image_b64: str, prompt: str) -> str:
    import httpx

    url = _azure_base_url(cfg)
    api_key = cfg.get("api_key") or ""
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}},
                {"type": "text", "text": prompt or "Напиши только текст с картинки, без кавычек и пояснений."},
            ],
        }
    ]
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            url,
            headers={"Content-Type": "application/json", "api-key": api_key},
            json={"messages": messages, "max_tokens": 512},
        )
        r.raise_for_status()
        data = r.json()
    return (data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
