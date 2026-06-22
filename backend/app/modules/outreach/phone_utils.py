"""Нормализация телефонов для outreach (РФ-кейс).

Зеркалит логику frontend/lib/phone.ts. Если правишь — синхронизируй обе
стороны, иначе xlsx «На обзвон», UI-пилл WA, и backend-канал WA разойдутся.

История: до 2026-06-23 эти функции дублировались в kp_call_list_export.py
с приватными именами `_normalize_phone` / `_is_russian_mobile`. Когда
появился GreenAPI-канал, потребовалась та же логика в kp_send_service —
вынесли в общий модуль.
"""

from __future__ import annotations

import re
from typing import Iterable

_SPLIT_RE = re.compile(r"[,;/]")
_NON_DIGIT_RE = re.compile(r"\D")


def normalize_phone(raw: str | None) -> str | None:
    """digits-only с РФ-нормализацией. Возвращает None для мусора.

    Правила:
      - всё кроме цифр отрезается, "доб. 100" теряется;
      - если есть `,` `;` `/` — берём только первую часть;
      - leading 8 (11 цифр) → 7 (РФ legacy → international);
      - 10 цифр и начинается на 9 → prepend 7 (мобильный без кода);
      - < 10 или > 15 цифр → None (битый номер).
    """
    if not raw:
        return None
    first = _SPLIT_RE.split(raw, 1)[0]
    digits = _NON_DIGIT_RE.sub("", first)
    if not digits:
        return None
    if len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    if len(digits) == 10 and digits.startswith("9"):
        digits = "7" + digits
    if len(digits) < 10 or len(digits) > 15:
        return None
    return digits


def is_russian_mobile(digits: str | None) -> bool:
    """Только мобильные РФ (79XXXXXXXXX) регистрируются в WhatsApp.
    Городские (8-495 и т.п.) → False, для них wa.me/{phone} отдаёт
    «invalid phone number»."""
    return bool(digits and len(digits) == 11 and digits.startswith("79"))


def format_phone_for_display(digits: str | None) -> str:
    """Человекочитаемый формат: +7 (495) 123-45-67 для РФ, +X… иначе."""
    if not digits:
        return ""
    if len(digits) == 11 and digits.startswith("7"):
        return (
            f"+7 ({digits[1:4]}) {digits[4:7]}-{digits[7:9]}-{digits[9:11]}"
        )
    return f"+{digits}"


def pick_first_mobile(candidates: Iterable[str | None]) -> str | None:
    """Первый валидный мобильный РФ-телефон из кандидатов (после
    нормализации). None если ни одного. Используется в KP-send, когда
    у компании в company_contacts/companies.phone лежит несколько
    номеров — для WhatsApp подходит только мобильный."""
    for raw in candidates:
        digits = normalize_phone(raw)
        if is_russian_mobile(digits):
            return digits
    return None
