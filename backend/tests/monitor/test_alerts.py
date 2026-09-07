"""Тесты алертов интеграций (monitor/alerts.py) — пороги и текст без БД."""

from __future__ import annotations

from app.modules.monitor.alerts import (
    ALERT_OK_PCT,
    MIN_CALLS,
    MIN_CALLS_HARD,
    _should_alert,
    build_alert_text,
)


def _stat(calls: int, ok: int, top_status: int | None = None) -> dict:
    return {
        "provider": "test",
        "calls": calls,
        "ok": ok,
        "ok_pct": round(ok / calls * 100, 1) if calls else 100.0,
        "top_status": top_status,
    }


def test_threshold_ok_when_healthy():
    assert not _should_alert(_stat(1000, 1000))


def test_threshold_alert_on_low_ok_pct():
    # DaData-кейс из аудита: много вызовов, ok 16%
    assert _should_alert(_stat(5400, 885, top_status=403))


def test_threshold_ignores_low_volume():
    # 10 вызовов 50% — шум, не алертим
    assert not _should_alert(_stat(10, 5))


def test_threshold_boundary_exact():
    # ровно 80.0% на объёме — не алерт (порог строго меньше)
    assert not _should_alert(_stat(100, 80))


def test_hard_status_402_even_few_calls():
    # OpenAI-кейс: 402 «нет оплаты» — алертим даже при 3 вызовах
    assert _should_alert(_stat(3, 0, top_status=402))


def test_hard_status_403_few_calls():
    assert _should_alert(_stat(5, 1, top_status=403))


def test_hard_status_429_low_volume_not_alert():
    # 429 — транзиент: на малом объёме молчим (поймается ок%-порогом при объёме)
    assert not _should_alert(_stat(5, 0, top_status=429))


def test_constants_sane():
    assert 0 < MIN_CALLS_HARD < MIN_CALLS
    assert 0 < ALERT_OK_PCT <= 100


def test_build_text_contains_provider_and_hint():
    text = build_alert_text(
        [
            {"provider": "openai_emb", "calls": 100, "ok": 0, "ok_pct": 0.0, "top_status": 402},
        ]
    )
    assert "embeddings" in text
    assert "нет оплаты" in text
    assert "402" in text
    assert "<b>" in text  # HTML для TG


def test_build_text_multiple_providers():
    text = build_alert_text(
        [
            {"provider": "dadata", "calls": 500, "ok": 50, "ok_pct": 10.0, "top_status": 403},
            {"provider": "serpapi", "calls": 200, "ok": 60, "ok_pct": 30.0, "top_status": 429},
        ]
    )
    assert "DaData" in text
    assert "SerpAPI" in text
    assert text.count("•") == 2
