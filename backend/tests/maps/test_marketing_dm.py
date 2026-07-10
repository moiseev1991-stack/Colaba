"""Unit-тесты pure-функций «Маркетинг-ЛПР Finder» — без БД.

Покрываем:
- _pick_best (marketing_dm.py) — выбор best-DM по приоритету;
- _same_person / _normalize_person_name (egrn_reconcile.py) — сверка ФИО;
- _normalize_company_name (hh_enrich.py) — матчинг названий hh↔company.

Оркестратор целиком не тестируем — там БД-запросы; интеграционный тест
в conftest.py уровня maps требует фикстур sessionmaker и полного alembic,
что для этих чистых функций избыточно.
"""

from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.modules.maps.egrn_reconcile import _same_person, _normalize_person_name
from app.modules.maps.hh_enrich import _normalize_company_name as _norm_hh_name
from app.modules.maps.marketing_dm import _pick_best, _has_contact


def _dm(**kw):
    """Fake CompanyDecisionMaker — SimpleNamespace достаточно, _pick_best
    читает атрибуты, а не ORM-инстанс."""
    defaults = dict(
        id=None,
        name="X",
        post=None,
        source="website_team",
        source_url=None,
        confidence=Decimal("0.5"),
        is_decision_maker=True,
        role_category=None,
        is_marketing_dm=False,
        contact_type=None,
        contact_value=None,
        egrn_matches_founder=None,
    )
    defaults.update(kw)
    return SimpleNamespace(**defaults)


# ---------------------------------------------------------------------------
# _pick_best
# ---------------------------------------------------------------------------


def test_pick_best_prefers_marketing_over_management():
    """Явный маркетолог всегда выигрывает у директора, даже если у директора
    выше confidence."""
    dms = [
        _dm(id=1, name="Директор", role_category="management",
            confidence=Decimal("0.95"), source="egrul_director"),
        _dm(id=2, name="Маркетолог", role_category="marketing",
            confidence=Decimal("0.6"), source="website_team"),
    ]
    best = _pick_best(dms)
    assert best is not None
    assert best.id == 2


def test_pick_best_prefers_founder_over_management():
    """Учредитель приоритетнее директора: в малом бизнесе учредитель
    реально принимает решения по маркетингу."""
    dms = [
        _dm(id=1, name="Директор", role_category="management",
            confidence=Decimal("0.9")),
        _dm(id=2, name="Учредитель", role_category="founder",
            confidence=Decimal("0.85")),
    ]
    best = _pick_best(dms)
    assert best.id == 2


def test_pick_best_higher_confidence_wins_within_role():
    """При равной role_category выбираем того, у кого confidence выше."""
    dms = [
        _dm(id=1, name="A", role_category="marketing",
            confidence=Decimal("0.6")),
        _dm(id=2, name="B", role_category="marketing",
            confidence=Decimal("0.85")),
    ]
    best = _pick_best(dms)
    assert best.id == 2


def test_pick_best_prefers_with_contact_when_confidence_equal():
    """При равной role + confidence — тот, у кого есть публичный канал."""
    dms = [
        _dm(id=1, name="Без контакта", role_category="marketing",
            confidence=Decimal("0.7")),
        _dm(id=2, name="С email", role_category="marketing",
            confidence=Decimal("0.7"),
            contact_type="email", contact_value="a@b.ru"),
    ]
    best = _pick_best(dms)
    assert best.id == 2


def test_pick_best_ignores_other_role():
    """role_category='other' и None НЕ должны попадать в best-DM —
    лучше «не нашли», чем пометить продажника как маркетинг-ЛПР."""
    dms = [
        _dm(id=1, name="Продажник", role_category="other",
            confidence=Decimal("0.9")),
        _dm(id=2, name="Кто-то", role_category=None,
            confidence=Decimal("0.9")),
    ]
    assert _pick_best(dms) is None


def test_pick_best_empty():
    assert _pick_best([]) is None


def test_has_contact_only_when_both_type_and_value():
    """contact_type без value или наоборот = не контакт (нельзя написать)."""
    assert _has_contact(_dm(contact_type="email", contact_value="a@b.ru"))
    assert not _has_contact(_dm(contact_type="email", contact_value=None))
    assert not _has_contact(_dm(contact_type=None, contact_value="a@b.ru"))
    assert not _has_contact(_dm())


def test_pick_best_source_priority_tiebreak():
    """Website приоритетнее ЕГРЮЛ при прочих равных — на сайте часто
    рядом контакт, из ЕГРЮЛ только ФИО."""
    dms = [
        _dm(id=1, name="A", role_category="founder",
            confidence=Decimal("0.85"), source="egrul_founder"),
        _dm(id=2, name="B", role_category="founder",
            confidence=Decimal("0.85"), source="website_team"),
    ]
    best = _pick_best(dms)
    assert best.id == 2


# ---------------------------------------------------------------------------
# _same_person (ЕГРН-сверка)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("a,b", [
    ("Иванов Иван Иванович", "ИВАНОВ ИВАН ИВАНОВИЧ"),
    ("Петров Петр Петрович", "петров петр петрович"),
    # Отчество отсутствует у одного из вариантов — всё равно матч.
    ("Иванов Иван Иванович", "Иванов Иван"),
    ("Сидоров Сергей", "Сидоров Сергей Сергеевич"),
])
def test_same_person_matches(a, b):
    assert _same_person(a, b)


@pytest.mark.parametrize("a,b", [
    # Разные фамилии — не матч, даже при совпадении имени.
    ("Иванов Иван", "Петров Иван"),
    # Разные имена при одинаковой фамилии.
    ("Иванов Иван", "Иванов Пётр"),
    # Разные отчества (когда оба указаны) — не матч.
    ("Иванов Иван Петрович", "Иванов Иван Сергеевич"),
    # Пустая строка.
    ("", "Иванов Иван"),
])
def test_same_person_rejects(a, b):
    assert not _same_person(a, b)


def test_normalize_person_name_handles_extra_spaces():
    surname, name, patr = _normalize_person_name("  Иванов   Иван  Иванович  ")
    assert (surname, name, patr) == ("иванов", "иван", "иванович")


def test_normalize_person_name_single_word():
    assert _normalize_person_name("Иванов") == ("иванов", "", "")


# ---------------------------------------------------------------------------
# _normalize_company_name (hh employer-match)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("raw,expected", [
    ('ООО "Ромашка"', "ромашка"),
    ('ООО «Ромашка»', "ромашка"),
    ("ЗАО Ромашка-Стройка", "ромашка стройка"),
    ("ИП Иванов Иван", "иванов иван"),
    ("Ромашка", "ромашка"),
    # Двойные пробелы и кавычки схлопываем.
    ('ПАО   "  Газпром  "', "газпром"),
])
def test_normalize_company_name(raw, expected):
    assert _norm_hh_name(raw) == expected


# ---------------------------------------------------------------------------
# website_email_playwright — фильтры pure-функций
# ---------------------------------------------------------------------------


from app.modules.maps.website_email_playwright import (
    _looks_like_real_email, _normalize_phone_ru,
)


@pytest.mark.parametrize("email", [
    "info@romashka.ru",
    "sales@my-company.com",
    "a.b@company.co.uk",
    "IVAN@romashka.ru",  # Case не важен — lowerим на вызывающей стороне.
])
def test_looks_like_real_email_accepts(email):
    assert _looks_like_real_email(email)


@pytest.mark.parametrize("email", [
    "",
    "not-an-email",
    "@romashka.ru",
    "a@",
    "example@example.com",
    "user@yourdomain.com",
    "abc@ingest.sentry.io",
    "test@wix.com",
    # Слишком короткий local part.
    "a@romashka.ru",
])
def test_looks_like_real_email_rejects(email):
    assert not _looks_like_real_email(email)


@pytest.mark.parametrize("raw,expected", [
    ("+7 (495) 123-45-67", "+74951234567"),
    ("8 495 123 45 67", "+74951234567"),
    ("+74951234567", "+74951234567"),
    ("(495) 123-45-67", "+74951234567"),  # 10 цифр → добавляем +7
])
def test_normalize_phone_ru_accepts(raw, expected):
    assert _normalize_phone_ru(raw) == expected


@pytest.mark.parametrize("raw", [
    "",
    "abc",
    "123",  # слишком мало цифр
    "12345678901234",  # слишком много
])
def test_normalize_phone_ru_rejects(raw):
    assert _normalize_phone_ru(raw) is None
