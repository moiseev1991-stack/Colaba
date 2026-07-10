"""Тесты матчинга email → директор ЕГРЮЛ.

Проверяем что pure-функции атрибуции корректно связывают локальную часть
email с транслитом ФИО. Полный оркестратор (attribute_emails_to_dms)
не тестируем здесь — это интеграционный тест, который требует БД.
"""

from __future__ import annotations

import pytest

from app.modules.maps.email_to_dm_attribution import (
    _local_part,
    _match_email_to_person,
    _parse_fio,
    _translit,
    _translit_variants,
)


class TestTranslit:
    def test_ivanov(self):
        assert _translit("Иванов") == "ivanov"

    def test_shakhobidinov(self):
        # реальный директор из E2E: Шахобидинов Фирдавс Джанобович
        assert _translit("Шахобидинов") == "shakhobidinov"

    def test_yurtaev(self):
        assert _translit("Юртаев") == "yurtaev"

    def test_kan_short(self):
        assert _translit("Кан") == "kan"


class TestTranslitVariants:
    def test_ovnov_alternatives(self):
        v = _translit_variants("Иванов")
        assert "ivanov" in v
        assert "ivanoff" in v  # -ov → -off
        assert "ivano" in v  # -ov → -o

    def test_short_no_alternatives_needed(self):
        v = _translit_variants("Кан")
        assert v == {"kan"}


class TestParseFio:
    def test_full_fio(self):
        r = _parse_fio("Иванов Иван Иванович")
        assert r is not None
        surname, name, _ = r
        assert "ivanov" in surname
        assert "ivan" in name

    def test_two_words(self):
        r = _parse_fio("Кан Анатолий")
        assert r is not None

    def test_single_word_fails(self):
        assert _parse_fio("Иванов") is None

    def test_empty(self):
        assert _parse_fio("") is None


class TestMatchEmailToPerson:
    def _fio(self, full):
        r = _parse_fio(full)
        assert r is not None
        return r[0], r[1]

    def test_surname_only(self):
        s, n = self._fio("Иванов Иван Иванович")
        assert _match_email_to_person("ivanov", s, n) == 0.7

    def test_first_initial_plus_lastname(self):
        s, n = self._fio("Иванов Иван Иванович")
        # 'iivanov' — склеенный вариант.
        assert _match_email_to_person("iivanov", s, n) == 0.75

    def test_dot_separated(self):
        s, n = self._fio("Иванов Иван Иванович")
        assert _match_email_to_person("i.ivanov", s, n) == 0.75

    def test_full_name_dot(self):
        s, n = self._fio("Иванов Иван Иванович")
        assert _match_email_to_person("ivan.ivanov", s, n) == 0.85

    def test_reverse_order(self):
        s, n = self._fio("Иванов Иван Иванович")
        assert _match_email_to_person("ivanov.ivan", s, n) == 0.85

    def test_name_only_weak(self):
        s, n = self._fio("Иванов Иван Иванович")
        assert _match_email_to_person("ivan", s, n) == 0.5

    def test_generic_info_no_match(self):
        s, n = self._fio("Иванов Иван Иванович")
        assert _match_email_to_person("info", s, n) == 0.0

    def test_generic_office_no_match(self):
        s, n = self._fio("Иванов Иван Иванович")
        assert _match_email_to_person("office", s, n) == 0.0

    def test_wrong_person(self):
        s, n = self._fio("Иванов Иван Иванович")
        # 'petrov' — вообще не совпадает.
        assert _match_email_to_person("petrov", s, n) == 0.0

    def test_short_name_kan(self):
        # Реальный директор из E2E: Кан Анатолий Иванович
        s, n = self._fio("Кан Анатолий Иванович")
        # 'kan' совпадает с фамилией.
        assert _match_email_to_person("kan", s, n) == 0.7
        # 'anatoliy' совпадает с именем.
        assert _match_email_to_person("anatoliy", s, n) == 0.5

    def test_shakhobidinov(self):
        # Реальный директор: Шахобидинов Фирдавс Джанобович
        s, n = self._fio("Шахобидинов Фирдавс Джанобович")
        assert _match_email_to_person("shakhobidinov", s, n) == 0.7
        # 'firdavs' — имя.
        assert _match_email_to_person("firdavs", s, n) == 0.5

    def test_uppercase_local_still_matches(self):
        s, n = self._fio("Иванов Иван Иванович")
        # local-part приходит в верхнем регистре — должен нормализоваться.
        assert _match_email_to_person("Ivanov".lower(), s, n) == 0.7

    def test_empty_local(self):
        s, n = self._fio("Иванов Иван Иванович")
        assert _match_email_to_person("", s, n) == 0.0


class TestLocalPart:
    def test_normal(self):
        assert _local_part("ivan.ivanov@company.ru") == "ivan.ivanov"

    def test_uppercase(self):
        assert _local_part("Ivan.Ivanov@Company.RU") == "ivan.ivanov"

    def test_no_at(self):
        assert _local_part("not-an-email") == ""

    def test_empty(self):
        assert _local_part("") == ""
