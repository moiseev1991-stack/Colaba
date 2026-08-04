# -*- coding: utf-8 -*-
"""Тесты update_config для email-провайдеров.

Регрессия бага: пустая строка в plain-поле (smtp_user, smtp_host, from_email)
при сохранении через UI затирала уже сохранённое значение в NULL. Корень —
асимметрия: секреты при '' оставались, а plain-поля сбрасывались.

После фикса: '' (и для секретов, и для plain-полей) означает «не менять».
"""

from __future__ import annotations

from app.modules.email.providers_service import (
    _apply_plain_update,
    _apply_secret_update,
)


def test_apply_plain_update_keeps_current_on_empty_string():
    """Пустая строка в plain-поле — не затирает существующее значение.

    Это и есть фикс бага: UI отправляет '' для незаполненных полей формы,
    и старое значение не должно теряться.
    """
    assert _apply_plain_update("old@example.com", "") == "old@example.com"
    assert _apply_plain_update("host.ru", "") == "host.ru"
    assert _apply_plain_update("whitespace", "   ") == "whitespace"


def test_apply_plain_update_keeps_current_on_none():
    """None (поле отсутствует в payload) — не трогает."""
    assert _apply_plain_update("keep@example.com", None) == "keep@example.com"


def test_apply_plain_update_sets_new_value():
    """Непустое новое значение — записывается."""
    assert _apply_plain_update("old@example.com", "new@example.com") == "new@example.com"
    assert _apply_plain_update(None, "first@example.com") == "first@example.com"


def test_apply_plain_update_strips_only_whitespace():
    """Строка из пробелов трактуется как пустая (не меняет)."""
    assert _apply_plain_update("keep@x.ru", "   ") == "keep@x.ru"
    assert _apply_plain_update("keep@x.ru", "\t\n") == "keep@x.ru"


def test_apply_secret_update_symmetry():
    """Секреты и plain-поля ведут себя одинаково для пустых значений."""
    # То же поведение, что и у plain — фикс делает их симметричными.
    assert _apply_secret_update("old-secret", "") == "old-secret"
    assert _apply_secret_update("old-secret", None) == "old-secret"
    assert _apply_secret_update("old-secret", "***") == "old-secret"
    assert _apply_secret_update("old-secret", "new-secret") == "new-secret"


def test_apply_plain_update_allows_real_change():
    """Сценарий «юзер меняет логин» — новое значение применяется."""
    assert _apply_plain_update("dmitry@old.ru", "dmitry@new.ru") == "dmitry@new.ru"
