"""Тесты валидатора контактов (contact_validation.py)."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.modules.maps.contact_validation import (
    _domain_has_mx,
    is_valid_email,
    is_valid_phone_ru,
)


class TestEmailFormat:
    """Проверка формата email — без MX-lookup."""

    @pytest.mark.parametrize(
        "email,expected",
        [
            ("director@company.ru", True),
            ("i.ivanov@spinlid.ru", True),
            ("pr+lead@example-corp.io", True),
            ("PR@Company.RU", True),  # нормализация в lower
        ],
    )
    def test_valid_formats(self, email: str, expected: bool) -> None:
        ok, reason, _norm = is_valid_email(email, check_mx=False)
        assert ok is expected, f"expected {expected} for {email}, got reason={reason}"

    @pytest.mark.parametrize(
        "email,reason_hint",
        [
            (None, "empty"),
            ("", "empty"),
            ("no-at-sign", "no_at"),
            ("@nolocal.ru", "bad_shape"),
            ("no-domain@", "bad_shape"),
            ("a@company.ru", "bad_local_length"),  # local < 2
        ],
    )
    def test_invalid_formats(self, email: str | None, reason_hint: str) -> None:
        ok, reason, _norm = is_valid_email(email, check_mx=False)
        assert ok is False
        assert reason_hint in reason

    @pytest.mark.parametrize(
        "email,reason",
        [
            ("noreply@company.ru", "blacklist_local"),
            ("no-reply@company.ru", "blacklist_local"),
            ("mailer-daemon@company.ru", "blacklist_local"),
            ("postmaster@company.ru", "blacklist_local"),
            ("example@example.com", "blacklist_domain"),
            ("info@yourdomain.com", "blacklist_domain"),
            ("hash@o12345.ingest.sentry.io", "sentry_id"),
        ],
    )
    def test_blacklists(self, email: str, reason: str) -> None:
        ok, r, _norm = is_valid_email(email, check_mx=False)
        assert ok is False
        assert r == reason

    def test_normalization(self) -> None:
        ok, _, norm = is_valid_email("PR@Company.RU", check_mx=False)
        assert ok is True
        assert norm == "pr@company.ru"


class TestEmailMX:
    """MX-check с моком dnspython, чтобы не бить реальный DNS в тестах."""

    def setup_method(self) -> None:
        # Сбрасываем LRU-кэш между тестами.
        _domain_has_mx.cache_clear()

    @patch("app.modules.maps.contact_validation._domain_has_mx", return_value=True)
    def test_mx_ok(self, _mock_mx) -> None:  # noqa: PT019
        ok, reason, _norm = is_valid_email("director@company.ru", check_mx=True)
        assert ok is True
        assert reason == ""

    @patch("app.modules.maps.contact_validation._domain_has_mx", return_value=False)
    def test_mx_missing(self, _mock_mx) -> None:  # noqa: PT019
        ok, reason, _norm = is_valid_email("director@company.ru", check_mx=True)
        assert ok is False
        assert reason == "no_mx"


class TestPhoneRu:
    @pytest.mark.parametrize(
        "raw,expected_norm",
        [
            ("+7 (999) 123-45-67", "+79991234567"),
            ("8 (495) 123-45-67", "+74951234567"),
            ("74951234567", "+74951234567"),
            ("(495) 123-45-67", "+74951234567"),  # 10 цифр
            ("+7 812 555 12 34", "+78125551234"),
        ],
    )
    def test_valid(self, raw: str, expected_norm: str) -> None:
        ok, reason, norm = is_valid_phone_ru(raw)
        assert ok is True, f"expected valid, got reason={reason}"
        assert norm == expected_norm

    @pytest.mark.parametrize(
        "raw,reason",
        [
            (None, "empty"),
            ("", "empty"),
            ("123", "bad_length"),
            ("+7 000 000 00 00", "blacklist"),
            ("+7 (999) 999-99-99", "blacklist"),
            ("+7 111 111 11 11", "blacklist"),
            # +1XXX = не РФ (первый цифра после 7 не 3/4/8/9)
            ("+7 100 000 00 00", "bad_operator"),
            ("+7 200 000 00 00", "bad_operator"),
        ],
    )
    def test_invalid(self, raw: str | None, reason: str) -> None:
        ok, r, _norm = is_valid_phone_ru(raw)
        assert ok is False
        assert r == reason
