"""Юнит-тесты сервиса KP-конвейера: extract_kp_json + build_kp_prompt.

Без БД — обе функции pure. Тестируем только их, потому что
`generate_kp` зависит от async SQLAlchemy + LLM-клиента; такой
интеграционный тест сделаем отдельно, когда поднимем тестовый Postgres.
"""

from __future__ import annotations

from app.modules.outreach.kp_service import build_kp_prompt, extract_kp_json


# --- extract_kp_json --------------------------------------------------------


def test_extract_plain_json():
    raw = '{"subject": "Тема", "body": "Тело"}'
    out = extract_kp_json(raw)
    assert out == {"subject": "Тема", "body": "Тело"}


def test_extract_json_with_whitespace():
    raw = '\n  {"subject": "S", "body": "B"}\n  '
    assert extract_kp_json(raw) == {"subject": "S", "body": "B"}


def test_extract_json_in_markdown_fence():
    raw = "```json\n{\"subject\": \"S\", \"body\": \"B\"}\n```"
    assert extract_kp_json(raw) == {"subject": "S", "body": "B"}


def test_extract_json_in_plain_fence():
    raw = "```\n{\"subject\": \"S\", \"body\": \"B\"}\n```"
    assert extract_kp_json(raw) == {"subject": "S", "body": "B"}


def test_extract_json_with_preamble():
    """LLM-обёртка типа «Готово: { ... }»."""
    raw = "Готово: {\"subject\": \"S\", \"body\": \"B\"}\nКонец."
    assert extract_kp_json(raw) == {"subject": "S", "body": "B"}


def test_extract_returns_none_on_garbage():
    assert extract_kp_json("это не json") is None
    assert extract_kp_json("") is None
    assert extract_kp_json("{неправильный json") is None


def test_extract_allows_empty_subject_for_messenger():
    """Мессенджер-канал (промпт «4 хода») требует пустой subject.
    Раньше `if subject and body:` ронял валидный ответ в plaintext-фолбэк,
    и юзер получал сырой JSON в поле «Текст». Теперь пустой subject легитимен.
    """
    raw = '{"subject": "", "body": "Привет? Как дела?"}'
    assert extract_kp_json(raw) == {"subject": "", "body": "Привет? Как дела?"}


def test_extract_allows_missing_subject_key():
    raw = '{"body": "только тело"}'
    assert extract_kp_json(raw) == {"subject": "", "body": "только тело"}


def test_extract_returns_none_when_body_empty():
    raw = '{"subject": "S", "body": "   "}'
    assert extract_kp_json(raw) is None


def test_extract_returns_none_when_types_wrong():
    raw = '{"subject": 123, "body": ["list"]}'
    assert extract_kp_json(raw) is None


# --- build_kp_prompt --------------------------------------------------------


def _ctx(**overrides):
    """Минимально валидный контекст промпта."""
    base = dict(
        sender_profile="веб-студия, делаем сайты",
        offer_hint="нет сайта → сайт + модуль записи",
        tone="neutral",
        company_name="Дентал Клиник",
        niche="стоматология",
        city="Балашиха",
        pain_label="Спорные доплаты за лечение",
        pain_mention_count=24,
        top_quote="«Доплатили 30к за приём, который должен был войти в смету»",
        trend_verdict="rising",
        benchmark_ratio=2.4,
        website="drmallaev.ru",
        rating=4.2,
        niche_avg_rating=4.5,
    )
    base.update(overrides)
    return base


def test_build_prompt_full_context_contains_all_facts():
    prompt = build_kp_prompt(**_ctx())
    assert "Дентал Клиник" in prompt
    assert "стоматология" in prompt
    assert "Балашиха" in prompt
    assert "Спорные доплаты за лечение" in prompt
    assert "24 упоминаний" in prompt
    assert "Доплатили 30к" in prompt
    # Tone в HUMAN-form, не литералом 'neutral'.
    assert "нейтральный, по-деловому" in prompt
    # Трендовая фраза присутствует.
    assert "выросли" in prompt
    # Бенчмарк — round'нулся до 2.4.
    assert "в 2.4 раза чаще" in prompt or "в 2.4" in prompt
    # Сайт + рейтинг
    assert "есть сайт drmallaev.ru" in prompt
    assert "4.2" in prompt
    assert "4.5" in prompt
    # Финал — обязательный JSON-инструктаж.
    assert "Верни строго JSON" in prompt


def test_build_prompt_skips_trend_when_stable():
    """Эпик D: если stable — строка про динамику не попадает в промпт."""
    prompt = build_kp_prompt(**_ctx(trend_verdict="stable"))
    assert "Динамика:" not in prompt
    assert "выросли" not in prompt


def test_build_prompt_skips_trend_when_no_data():
    prompt = build_kp_prompt(**_ctx(trend_verdict="no_data"))
    assert "Динамика:" not in prompt


def test_build_prompt_skips_benchmark_when_none():
    prompt = build_kp_prompt(**_ctx(benchmark_ratio=None))
    assert "Сравнение с конкурентами:" not in prompt
    assert "чаще, чем в среднем" not in prompt


def test_build_prompt_skips_benchmark_when_on_par():
    prompt = build_kp_prompt(**_ctx(benchmark_ratio=1.0))
    assert "Сравнение с конкурентами:" not in prompt


def test_build_prompt_no_website():
    prompt = build_kp_prompt(**_ctx(website=None))
    assert "нет сайта" in prompt
    assert "есть сайт" not in prompt


def test_build_prompt_rating_without_niche_avg():
    prompt = build_kp_prompt(**_ctx(niche_avg_rating=None))
    # Должна быть просто строка про рейтинг без скобок «средний по нише».
    assert "Рейтинг: 4.2" in prompt
    assert "средний по нише" not in prompt


def test_build_prompt_no_pain_skips_pain_lines():
    """Защитный случай — формально функция принимает None у боли.
    В реальной ветке kp_service.generate_kp такой случай отсекается раньше
    (бросает 409). Здесь просто проверяем что build_kp_prompt не падает.
    """
    prompt = build_kp_prompt(
        **_ctx(pain_label=None, pain_mention_count=None, top_quote=None)
    )
    assert "Главная боль" not in prompt
    assert "Цитата из реального отзыва" not in prompt
    # Остальные факты остаются.
    assert "Дентал Клиник" in prompt


def test_build_prompt_uses_bold_tone_hint():
    prompt = build_kp_prompt(**_ctx(tone="bold"))
    assert "уверенный, прямой, но без давления" in prompt


# --- 2026-07-11: multi-pain -------------------------------------------------


def test_build_prompt_multi_pain_includes_each_pain_line():
    """Юзер выбрал 3 боли в UI → LLM получает все три label+цитата, а
    tail-инструкция явно требует упомянуть КАЖДУЮ."""
    prompt = build_kp_prompt(
        **_ctx(
            additional_pains=[
                {
                    "label": "Долгое ожидание приёма",
                    "mention_count": 18,
                    "top_quote": "«Ждали 40 минут, врач опоздал»",
                },
                {
                    "label": "Неприветливое отношение врачей",
                    "mention_count": 11,
                    "top_quote": "«Разговаривали свысока»",
                },
            ]
        )
    )
    # Основная боль по-прежнему первая
    assert "Спорные доплаты за лечение" in prompt
    assert "24 упоминаний" in prompt
    # Дополнительные боли — каждая со своим label + цитата + count
    assert "Долгое ожидание приёма" in prompt
    assert "18 упоминаний" in prompt
    assert "Ждали 40 минут" in prompt
    assert "Неприветливое отношение врачей" in prompt
    assert "11 упоминаний" in prompt
    assert "Разговаривали свысока" in prompt
    # Tail-инструкция про «упомяни КАЖДУЮ» присутствует
    assert "упомяни КАЖДУЮ" in prompt or "упомяни каждую" in prompt.lower()


def test_build_prompt_multi_pain_empty_additional_falls_back_to_single():
    """additional_pains=[] или None ведут себя как раньше — только topline."""
    prompt_none = build_kp_prompt(**_ctx(additional_pains=None))
    prompt_empty = build_kp_prompt(**_ctx(additional_pains=[]))
    # Строк с дополнительными болями нет
    assert "Ждали 40 минут" not in prompt_none
    assert "Ждали 40 минут" not in prompt_empty
    # Основная боль на месте
    assert "Спорные доплаты за лечение" in prompt_none
    assert "Спорные доплаты за лечение" in prompt_empty


def test_build_prompt_multi_pain_skips_extras_without_quote():
    """Доп. боль без quote — фильтруется в generate_kp, но защитно
    проверим что build_prompt не падает если такое всё же прилетело:
    label-строка есть, quote-строка пропущена."""
    prompt = build_kp_prompt(
        **_ctx(
            additional_pains=[
                {
                    "label": "Странная навигация в кабинете",
                    "mention_count": 4,
                    "top_quote": None,
                }
            ]
        )
    )
    assert "Странная навигация в кабинете" in prompt
    assert "4 упоминаний" in prompt
