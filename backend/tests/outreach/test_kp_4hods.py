"""Юнит-тесты каркаса «4 хода» (2026-07-11 ТЗ).

Покрываем:
- match_pain_key: маппинг label → key
- fill_pains: consequence/solution подтягиваются из справочника
- build_prompt_4hods: содержит ходы 1-4, respect'ит канал messenger vs email
- validate_kp: ловит длину, множественные вопросы, ссылки, стоп-слова
"""

from __future__ import annotations

from app.modules.outreach.pain_dictionaries import (
    AUTOMATION,
    PAIN_KEYS,
    fill_pains,
    find_stop_words,
    has_url,
    match_pain_key,
)
from app.modules.outreach.kp_prompts_v2 import build_prompt_4hods
from app.modules.outreach.kp_validator import validate_kp


# --- match_pain_key ---------------------------------------------------------


def test_match_pain_key_call_no_answer():
    assert match_pain_key("Проблемы с дозвоном") == "call_no_answer"
    assert match_pain_key("не берут трубку") == "call_no_answer"
    assert match_pain_key("долго ждали ответа") == "call_no_answer"


def test_match_pain_key_schedule_wait():
    assert match_pain_key("Долгое ожидание приёма") == "schedule_wait"
    assert match_pain_key("переносы и задержки записи") == "schedule_wait"


def test_match_pain_key_schedule_hard():
    assert match_pain_key("Проблемы с записью на приём") == "schedule_hard"
    assert match_pain_key("Проблемы с записью на услуги") == "schedule_hard"


def test_match_pain_key_admin_rude():
    assert match_pain_key("Грубость администратора") == "admin_rude"


def test_match_pain_key_food_slow():
    assert match_pain_key("Долгое ожидание еды") == "food_slow"
    assert match_pain_key("долгое ожидание заказа") == "food_slow"


def test_match_pain_key_unknown_returns_none():
    """Боли, не относящиеся к автоматизации, не матчатся."""
    assert match_pain_key("Неприемлемая чистота помещения") is None
    assert match_pain_key("Некомпетентные врачи") is None
    assert match_pain_key("") is None
    assert match_pain_key(None) is None  # type: ignore[arg-type]


def test_all_pain_keys_have_dict_entries():
    """Все объявленные PAIN_KEYS должны иметь consequence и solution."""
    for key in PAIN_KEYS:
        assert key in AUTOMATION.consequence, f"нет consequence для {key}"
        assert key in AUTOMATION.solution, f"нет solution для {key}"


# --- fill_pains -------------------------------------------------------------


def test_fill_pains_maps_consequence_and_solution():
    pains = [
        {"label": "Проблемы с дозвоном", "mention_count": 15, "top_quote": "не берут трубку"},
        {"label": "Неприемлемая чистота", "mention_count": 3, "top_quote": None},
    ]
    filled = fill_pains(pains, offer_theme="automation")
    assert len(filled) == 2
    assert filled[0].pain_key == "call_no_answer"
    assert filled[0].consequence is not None
    assert "соседям" in filled[0].consequence
    assert filled[0].solution is not None
    # Второй — не сматчился → пусто, ходы 2/3 промпт для него не собирает
    assert filled[1].pain_key is None
    assert filled[1].consequence is None
    assert filled[1].solution is None


def test_fill_pains_unknown_theme_returns_none_dicts():
    pains = [{"label": "Проблемы с дозвоном", "mention_count": 1, "top_quote": "..."}]
    filled = fill_pains(pains, offer_theme="serm")
    assert filled[0].pain_key == "call_no_answer"
    # тема неизвестна — consequence/solution пустые
    assert filled[0].consequence is None
    assert filled[0].solution is None


# --- build_prompt_4hods -----------------------------------------------------


def _sample_filled():
    from app.modules.outreach.pain_dictionaries import PainFilled
    return [
        PainFilled(
            label="Проблемы с дозвоном",
            mention_count=15,
            top_quote="Не могу дозвониться уже неделю",
            source="yandex_maps",
            pain_key="call_no_answer",
            consequence=AUTOMATION.consequence["call_no_answer"],
            solution=AUTOMATION.solution["call_no_answer"],
        )
    ]


def test_build_prompt_4hods_messenger_contains_all_4_hods():
    prompt = build_prompt_4hods(
        channel="messenger",
        sender_profile="автоматизирую связь для клиник",
        company_name="Стомадент",
        niche="стоматология",
        city="Балашиха",
        pains=_sample_filled(),
        my_offer_step="созвон 10 минут",
        tone="neutral",
        recipient_first_name="Анна",
    )
    assert "ХОД1:" in prompt
    assert "ХОД2:" in prompt
    assert "ХОД3:" in prompt
    assert "ХОД4:" in prompt
    # мессенджер: без темы, без ссылок
    assert 'subject": ""' in prompt
    assert "WhatsApp банит" in prompt or "без ссылок" in prompt.lower()
    # Имя для обращения — «Анна»
    assert "Анна" in prompt


def test_build_prompt_4hods_email_has_subject_rules():
    prompt = build_prompt_4hods(
        channel="email",
        sender_profile="автоматизирую связь для клиник",
        company_name="Стомадент",
        niche="стоматология",
        city="Балашиха",
        pains=_sample_filled(),
        my_offer_step="созвон 10 минут",
        tone="neutral",
    )
    assert "Тема письма" in prompt
    assert "6–9 строк" in prompt
    # без имени → нейтральное обращение
    assert "нейтральное" in prompt


def test_build_prompt_4hods_skips_hod2_3_when_pain_unknown():
    from app.modules.outreach.pain_dictionaries import PainFilled
    pains = [PainFilled(
        label="Некомпетентные врачи",
        mention_count=10, top_quote="плохо лечат", source=None,
        pain_key=None, consequence=None, solution=None,
    )]
    prompt = build_prompt_4hods(
        channel="messenger",
        sender_profile="автоматизирую связь",
        company_name="X", niche="Y", city="Z",
        pains=pains, my_offer_step="созвон", tone="neutral",
    )
    # ходы 2 и 3 сообщают LLM что данных нет — не выдумывает
    assert "не задано в справочнике" in prompt


# --- validate_kp ------------------------------------------------------------


def test_validate_kp_messenger_ok():
    v = validate_kp(
        subject="",
        body=(
            "Здравствуйте, Анна.\n"
            "Смотрел отзывы Стомадента на Я.Картах — 15 человек пишут про дозвон.\n"
            "Каждый не дозвонившийся уходит к соседям — деньги мимо.\n"
            "Могу показать, как звонки перестанут теряться.\n"
            "Удобно завтра 15 минут?"
        ),
        channel="messenger",
    )
    assert v.ok, [i.detail for i in v.issues]


def test_validate_kp_messenger_catches_url():
    v = validate_kp(
        subject="",
        body="Тест сообщения\nссылка https://example.ru/\nодин вопрос?",
        channel="messenger",
    )
    assert not v.ok
    assert any(i.kind == "url" for i in v.issues)


def test_validate_kp_catches_multiple_questions():
    v = validate_kp(
        subject="",
        body=(
            "Как думаете?\nЕщё вопрос?\nИ третий вопрос?"
        ),
        channel="messenger",
    )
    assert not v.ok
    assert any(i.kind == "question_end" for i in v.issues)


def test_validate_kp_catches_stop_word():
    v = validate_kp(
        subject="Уникальное предложение",
        body=(
            "Здравствуйте.\n"
            "Мы динамично развивающаяся компания.\n"
            "Что скажете?"
        ),
        channel="email",
    )
    assert not v.ok
    kinds = {i.kind for i in v.issues}
    assert "stop_word" in kinds


def test_validate_kp_catches_length_over_limit_messenger():
    long_body = "\n".join(["строка " + str(i) for i in range(12)]) + "\nСпросить?"
    v = validate_kp(subject="", body=long_body, channel="messenger")
    assert not v.ok
    assert any(i.kind == "length" for i in v.issues)


# --- have_url / find_stop_words spot checks ---------------------------------


def test_has_url_detects_various():
    assert has_url("см. https://foo.ru")
    assert has_url("наш сайт: www.foo.ru")
    assert has_url("t.me/mychannel")
    assert has_url("vk.com/mygroup")
    assert not has_url("просто текст без ссылок")


def test_find_stop_words_hit():
    hits = find_stop_words("Мы — компания с 10-летний опыт")
    assert len(hits) >= 1


def test_find_stop_words_clean():
    assert find_stop_words("Просто текст, ничего запрещённого") == []
