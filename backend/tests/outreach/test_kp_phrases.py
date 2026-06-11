"""Юнит-тесты детерминированных фраз тренда и бенчмарка.

Эпик D §3 ТЗ: «формулировки генерить детерминированно в Python (не LLM)».
Логика покрыта тестами целиком, потому что она напрямую попадает в
промпт КП — баг здесь = выдуманный аргумент в письме лиду.
"""

from __future__ import annotations

import pytest

from app.modules.outreach.kp_phrases import (
    benchmark_phrase,
    trend_phrase,
    website_status_phrase,
)


# --- trend_phrase ----------------------------------------------------------


def test_trend_rising_short_period_default():
    """Дефолтный rising — формулировка про «последний месяц»."""
    out = trend_phrase("rising")
    assert "выросли" in out
    assert "месяц" in out


def test_trend_rising_long_period():
    """Окно > 1 мес. — фраза подстраивает срок."""
    out = trend_phrase("rising", period_months=3)
    assert "выросли" in out
    assert "3 мес" in out


def test_trend_falling_returns_text():
    out = trend_phrase("falling")
    assert "снижаются" in out


@pytest.mark.parametrize("verdict", ["stable", "no_data", "unknown", "", "weird"])
def test_trend_other_returns_empty(verdict: str):
    """ТЗ Эпик D §1: если stable/no_data — фразу опускать."""
    assert trend_phrase(verdict) == ""


# --- benchmark_phrase -------------------------------------------------------


def test_benchmark_none_is_empty():
    assert benchmark_phrase(None) == ""


def test_benchmark_zero_or_negative_is_empty():
    """Защита от мусора — не падаем."""
    assert benchmark_phrase(0) == ""
    assert benchmark_phrase(-1.0) == ""


def test_benchmark_above_threshold_returns_phrase():
    """ratio >= 1.5 → 'в X раза чаще'."""
    out = benchmark_phrase(2.5)
    assert "в 2.5 раза чаще" in out


def test_benchmark_close_to_integer_rounds():
    """1.95 → '2 раза' (отрезаем дробную часть, если близко к целому)."""
    out = benchmark_phrase(1.95)
    # ожидаем «в 2 раза», не «в 2.0 раза» — конкретнее звучит
    assert "в 2 раза" in out
    assert "2.0" not in out


def test_benchmark_below_threshold_returns_phrase():
    """ratio < 0.66 → 'реже … держат планку'."""
    out = benchmark_phrase(0.4)
    assert "реже" in out
    assert "держат планку" in out


def test_benchmark_on_par_returns_empty():
    """on_par — не убеждающий аргумент, фразу опускаем."""
    for r in (0.7, 1.0, 1.2, 1.49):
        assert benchmark_phrase(r) == "", f"ratio={r}"


# --- website_status_phrase --------------------------------------------------


def test_website_status_none_or_empty():
    assert website_status_phrase(None) == "нет сайта"
    assert website_status_phrase("") == "нет сайта"
    assert website_status_phrase("   ") == "нет сайта"


def test_website_status_with_url():
    assert "drmallaev.ru" in website_status_phrase("drmallaev.ru")
    assert website_status_phrase("drmallaev.ru").startswith("есть сайт")
