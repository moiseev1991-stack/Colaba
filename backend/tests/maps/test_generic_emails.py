"""Тесты split_generic_emails — отсева общей почты (info@) от личной."""

from __future__ import annotations

import pytest

from app.modules.maps.generic_emails import split_generic_emails


class TestSplitGenericEmails:
    def test_empty_input_returns_empty(self) -> None:
        assert split_generic_emails(None, None) == []
        assert split_generic_emails([], None) == []
        assert split_generic_emails([], set()) == []

    def test_info_at_is_generic(self) -> None:
        result = split_generic_emails(["info@spinlid.ru"], set())
        assert result == ["info@spinlid.ru"]

    def test_personal_email_filtered_out(self) -> None:
        result = split_generic_emails(
            ["ivanov@spinlid.ru", "info@spinlid.ru"],
            personal_emails={"ivanov@spinlid.ru"},
        )
        assert result == ["info@spinlid.ru"]

    def test_case_normalization(self) -> None:
        result = split_generic_emails(
            ["  INFO@SPINLID.RU "],
            personal_emails=set(),
        )
        assert result == ["info@spinlid.ru"]

    def test_personal_email_case_insensitive(self) -> None:
        result = split_generic_emails(
            ["Ivanov@spinlid.ru", "hello@spinlid.ru"],
            personal_emails={"ivanov@spinlid.ru"},
        )
        assert result == ["hello@spinlid.ru"]

    def test_unknown_local_still_kept_when_not_personal(self) -> None:
        # zakupki@ не в whitelist, но раз не привязан к персоне — тоже
        # считаем общим (у SMB это часто «zakupki@», «reklama@», «feedback@»).
        result = split_generic_emails(["zakupki@x.ru"], personal_emails=set())
        assert result == ["zakupki@x.ru"]

    def test_dedup(self) -> None:
        result = split_generic_emails(
            ["info@x.ru", "INFO@X.RU", "info@x.ru"],
            personal_emails=set(),
        )
        assert result == ["info@x.ru"]

    def test_multiple_generics_preserve_order(self) -> None:
        result = split_generic_emails(
            ["info@x.ru", "sales@x.ru", "hr@x.ru"],
            personal_emails=set(),
        )
        assert result == ["info@x.ru", "sales@x.ru", "hr@x.ru"]

    def test_invalid_strings_skipped(self) -> None:
        result = split_generic_emails(
            ["not-an-email", "", "  ", "ok@x.ru"],  # type: ignore[list-item]
            personal_emails=set(),
        )
        assert result == ["ok@x.ru"]

    @pytest.mark.parametrize(
        "local",
        [
            "info", "contact", "hello", "office", "mail", "sales",
            "help", "support", "admin", "reklama", "hr", "press",
        ],
    )
    def test_whitelist_locals(self, local: str) -> None:
        addr = f"{local}@x.ru"
        result = split_generic_emails([addr], personal_emails=set())
        assert result == [addr]
