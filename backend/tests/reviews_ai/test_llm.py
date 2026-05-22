"""Тесты LLM-обёрток reviews_ai.

chat() мокается через monkeypatch на app.modules.reviews_ai.llm.chat.
pick_assistant_id тестируется напрямую через AsyncSessionLocal с реальными
записями ai_assistant.
"""

from __future__ import annotations  # noqa: только в тестах

import uuid

import pytest

from app.core.database import AsyncSessionLocal
from app.models.ai_assistant import AiAssistant
from app.modules.reviews_ai import llm


def _new_assistant_kwargs(name: str, provider_type: str = "anthropic", model: str = "claude-haiku-4-5"):
    return dict(
        name=name,
        provider_type=provider_type,
        model=model,
        config={},
    )


# ---------------------------------------------------------------------------
# _extract_json
# ---------------------------------------------------------------------------


def test_extract_json_plain_array():
    out = llm._extract_json('[{"id": 1, "sentiment": "positive"}]')
    assert out == [{"id": 1, "sentiment": "positive"}]


def test_extract_json_plain_object():
    out = llm._extract_json('{"label": "x", "description": "y"}')
    assert out == {"label": "x", "description": "y"}


def test_extract_json_in_markdown_fence():
    raw = 'Sure!\n```json\n{"label": "x", "description": "y"}\n```\nDone.'
    assert llm._extract_json(raw) == {"label": "x", "description": "y"}


def test_extract_json_returns_none_on_garbage():
    assert llm._extract_json("nope, not json at all") is None
    assert llm._extract_json("") is None
    assert llm._extract_json(None) is None  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# pick_assistant_id
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pick_assistant_id_auto_picks_haiku_for_sentiment(monkeypatch):
    """Проверяем что pick предпочитает haiku-модель сонету для kind='sentiment'.
    Тест не зависит от leftover в БД: использует уникальные модели и проверяет
    что pick НЕ вернул sonnet-кандидата."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "REVIEWS_AI_SENTIMENT_ASSISTANT_NAME", "", raising=False)
    # Перетряхиваем _KIND_HINTS на уникальные маркеры, чтобы не споткнуться о leftover-data
    monkeypatch.setitem(llm._KIND_HINTS, "sentiment", [f"isol-haiku-{uuid.uuid4().hex[:6]}"])
    haiku_marker = llm._KIND_HINTS["sentiment"][0]

    async with AsyncSessionLocal() as db:
        a_sonnet = AiAssistant(**_new_assistant_kwargs(
            f"isol-sonnet-{uuid.uuid4().hex[:8]}", model="some-sonnet-model"))
        a_haiku = AiAssistant(**_new_assistant_kwargs(
            f"isol-target-{uuid.uuid4().hex[:8]}", model=haiku_marker))
        db.add_all([a_sonnet, a_haiku])
        await db.commit()
        await db.refresh(a_haiku)

        picked = await llm.pick_assistant_id(db, "sentiment")
        # должен взять именно нашего haiku (никто другой с этим уникальным маркером не существует)
        assert picked == a_haiku.id


@pytest.mark.asyncio
async def test_pick_assistant_id_respects_explicit_env_name(monkeypatch):
    from app.core.config import settings
    suffix = uuid.uuid4().hex[:8]
    target_name = f"my-favorite-{suffix}"

    async with AsyncSessionLocal() as db:
        other = AiAssistant(**_new_assistant_kwargs(f"other-{suffix}", model="claude-haiku-4-5"))
        target = AiAssistant(**_new_assistant_kwargs(target_name, model="some-random-model"))
        db.add_all([other, target])
        await db.commit()
        await db.refresh(target)

        monkeypatch.setattr(settings, "REVIEWS_AI_SENTIMENT_ASSISTANT_NAME", target_name, raising=False)
        picked = await llm.pick_assistant_id(db, "sentiment")
        assert picked == target.id


# ---------------------------------------------------------------------------
# call_llm_sentiment / call_llm_cluster_naming
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sentiment_parses_response(monkeypatch):
    async def fake_chat(**_kwargs):
        return '[{"id": 1, "sentiment": "negative", "score": 0.9}, {"id": 2, "sentiment": "positive", "score": 0.7}]'

    async def fake_pick(_db, _kind):
        return 42

    monkeypatch.setattr(llm, "chat", fake_chat)
    monkeypatch.setattr(llm, "pick_assistant_id", fake_pick)

    async with AsyncSessionLocal() as db:
        out = await llm.call_llm_sentiment(db, [{"id": 1, "text": "плохо"}, {"id": 2, "text": "хорошо"}])
        assert out == [
            {"id": 1, "sentiment": "negative", "score": 0.9},
            {"id": 2, "sentiment": "positive", "score": 0.7},
        ]


@pytest.mark.asyncio
async def test_sentiment_returns_none_when_no_assistant(monkeypatch):
    async def fake_pick(_db, _kind):
        return None

    monkeypatch.setattr(llm, "pick_assistant_id", fake_pick)

    async with AsyncSessionLocal() as db:
        out = await llm.call_llm_sentiment(db, [{"id": 1, "text": "x"}])
        assert out is None


@pytest.mark.asyncio
async def test_cluster_naming_parses_response(monkeypatch):
    async def fake_chat(**_kwargs):
        return '```json\n{"label": "долгое ожидание", "description": "клиенты жалуются на время"}\n```'

    async def fake_pick(_db, _kind):
        return 99

    monkeypatch.setattr(llm, "chat", fake_chat)
    monkeypatch.setattr(llm, "pick_assistant_id", fake_pick)

    async with AsyncSessionLocal() as db:
        out = await llm.call_llm_cluster_naming(db, "стоматология", ["долго ждали", "очередь"])
        assert out == {"label": "долгое ожидание", "description": "клиенты жалуются на время"}


@pytest.mark.asyncio
async def test_cluster_naming_returns_none_on_invalid_json(monkeypatch):
    async def fake_chat(**_kwargs):
        return "Just text, no json"

    async def fake_pick(_db, _kind):
        return 1

    monkeypatch.setattr(llm, "chat", fake_chat)
    monkeypatch.setattr(llm, "pick_assistant_id", fake_pick)

    async with AsyncSessionLocal() as db:
        assert await llm.call_llm_cluster_naming(db, "x", ["sample"]) is None
