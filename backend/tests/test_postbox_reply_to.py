# -*- coding: utf-8 -*-
"""Тесты reply_to в Postbox HTTP-транспорте.

Проверяем, что postbox_http.send_email корректно передаёт ReplyToAddresses
в boto3 send_email — это закрывает архитектуру «ответы на ящик клиента»
(From = системный домен, Reply-To = личный email пользователя).

Не дёргаем реальный Postbox — boto3-клиент мокается через monkeypatch.
"""

from __future__ import annotations

import pytest

from app.modules.email import postbox_http


class _FakeClient:
    """Запоминает аргументы send_email вместо реального сетевого вызова."""

    def __init__(self) -> None:
        self.captured: dict = {}

    def send_email(self, **kwargs):
        self.captured = kwargs
        return {"MessageId": "test-message-id-123"}


@pytest.mark.asyncio
async def test_postbox_reply_to_is_passed(monkeypatch):
    """При reply_to задан — boto3 получает ReplyToAddresses=[reply_to]."""
    fake = _FakeClient()
    monkeypatch.setattr(postbox_http, "_build_client", lambda *a, **kw: fake)

    message_id = await postbox_http.send_email(
        access_key_id="key-id",
        secret_access_key="secret",
        from_email="hello@spinlid.ru",
        to_email="lead@example.com",
        subject="Тест",
        text_body="Тело письма",
        from_name="SpinLid",
        reply_to="client@gmail.com",
    )

    assert message_id == "test-message-id-123"
    # ReplyToAddresses — отдельный top-level параметр send_email (AWS SESv2),
    # НЕ внутри Destination.
    assert fake.captured["Destination"] == {"ToAddresses": ["lead@example.com"]}
    assert fake.captured["ReplyToAddresses"] == ["client@gmail.com"]


@pytest.mark.asyncio
async def test_postbox_without_reply_to_has_no_header(monkeypatch):
    """Без reply_to — параметр ReplyToAddresses отсутствует в вызове."""
    fake = _FakeClient()
    monkeypatch.setattr(postbox_http, "_build_client", lambda *a, **kw: fake)

    await postbox_http.send_email(
        access_key_id="key-id",
        secret_access_key="secret",
        from_email="hello@spinlid.ru",
        to_email="lead@example.com",
        subject="Тест",
        text_body="Тело письма",
        # reply_to не передаём
    )

    assert "ReplyToAddresses" not in fake.captured


@pytest.mark.asyncio
async def test_postbox_reply_to_none_explicit(monkeypatch):
    """Явный reply_to=None — эквивалентно отсутствию (без заголовка)."""
    fake = _FakeClient()
    monkeypatch.setattr(postbox_http, "_build_client", lambda *a, **kw: fake)

    await postbox_http.send_email(
        access_key_id="key-id",
        secret_access_key="secret",
        from_email="hello@spinlid.ru",
        to_email="lead@example.com",
        subject="Тест",
        text_body="Тело письма",
        reply_to=None,
    )

    assert "ReplyToAddresses" not in fake.captured["Destination"]
