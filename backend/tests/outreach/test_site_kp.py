"""Юнит-тесты site-варианта KP-конвейера (Эпик F ТЗ 2026-06-12).

Тестируем чистые функции:
- lookup_entry_meaning (kp_phrases)
- extract_domain (site_leads_service)
- build_kp_prompt_for_site (kp_service)

Бэк-сторона generate_kp_for_site зависит от async SQLAlchemy + LLM —
интеграционный тест пойдёт отдельно, когда поднимем тестовый Postgres.
"""

from __future__ import annotations

import pytest

from app.modules.outreach.kp_prompts import lookup_entry_meaning
from app.modules.outreach.kp_service import build_kp_prompt_for_site
from app.modules.outreach.site_leads_service import extract_domain


# --- lookup_entry_meaning ---------------------------------------------------


def test_lookup_entry_meaning_copyright_2021():
    out = lookup_entry_meaning("© 2021")
    assert out is not None
    assert "не обновлялся" in out


def test_lookup_entry_meaning_joomla_case_insensitive():
    out = lookup_entry_meaning("Joomla! 3.10")
    assert out is not None
    assert "Joomla" in out


def test_lookup_entry_meaning_delivery_by_phone():
    out = lookup_entry_meaning("доставка по телефону +7...")
    assert out is not None
    assert "интернет-магазина" in out


def test_lookup_entry_meaning_unknown_returns_none():
    """Свободный запрос юзера не должен подкидывать выдуманную трактовку."""
    assert lookup_entry_meaning("какая-то рандомная строка") is None
    assert lookup_entry_meaning("") is None
    assert lookup_entry_meaning(None) is None


# --- extract_domain --------------------------------------------------------


@pytest.mark.parametrize(
    "url, expected",
    [
        ("https://www.example.com/path", "example.com"),
        ("http://Example.com:8080/foo", "example.com"),
        ("https://sub.domain.example.com", "sub.domain.example.com"),
        ("https://example.com", "example.com"),
        ("ftp://files.example.com", "files.example.com"),
    ],
)
def test_extract_domain_normal(url: str, expected: str):
    assert extract_domain(url) == expected


def test_extract_domain_fallback_on_garbage():
    """Если URL невалидный — возвращаем хоть что-то, не падаем."""
    out = extract_domain("not-a-url")
    assert isinstance(out, str)
    assert len(out) > 0


# --- build_kp_prompt_for_site ----------------------------------------------


def _site_ctx(**overrides):
    base = dict(
        sender_profile="веб-студия, делаем сайты",
        offer_hint="заброшенный сайт → редизайн на современном стеке",
        tone="neutral",
        url="https://example.com",
        domain="example.com",
        title="Пример сайта",
        entry="© 2021",
        entry_meaning="копирайт 2021 года — сайт давно не обновлялся, заброшен",
    )
    base.update(overrides)
    return base


def test_site_prompt_contains_url_and_entry_meaning():
    prompt = build_kp_prompt_for_site(**_site_ctx())
    assert "https://example.com" in prompt
    assert "example.com" in prompt
    assert "Пример сайта" in prompt  # title в receiver-line
    assert "© 2021" in prompt
    assert "копирайт 2021 года" in prompt
    assert "Верни строго JSON" in prompt


def test_site_prompt_skips_entry_when_meaning_unknown():
    """Если ENTRY_MEANINGS не нашло трактовку — строка про признак опускается."""
    prompt = build_kp_prompt_for_site(
        **_site_ctx(entry="свой запрос", entry_meaning=None)
    )
    assert "Признак:" not in prompt
    # URL остаётся
    assert "example.com" in prompt


def test_site_prompt_skips_entry_when_entry_empty():
    prompt = build_kp_prompt_for_site(
        **_site_ctx(entry=None, entry_meaning=None)
    )
    assert "Признак:" not in prompt


def test_site_prompt_without_title():
    """Title из выдачи может отсутствовать — receiver-line всё равно валидный."""
    prompt = build_kp_prompt_for_site(**_site_ctx(title=None))
    assert "Получатель: example.com." in prompt


def test_site_prompt_uses_bold_tone_hint():
    prompt = build_kp_prompt_for_site(**_site_ctx(tone="bold"))
    assert "уверенный, прямой, но без давления" in prompt
