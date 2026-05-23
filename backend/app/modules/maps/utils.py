"""Утилиты модуля maps.

mask_author        — анонимизация имени автора отзыва (152-ФЗ)
normalize_text_for_hash — приведение к каноничному виду для дедупа
hash_review_text   — sha256 нормализованного текста
derive_sentiment_from_rating — fallback тональности до LLM-обработки
"""

from __future__ import annotations

import hashlib
import re


def mask_author(full_name: str | None) -> str:
    """Преобразует 'Иван Иванов' → 'И. И.'. Пустые/None → 'Аноним'.

    Берём первые две части (имя + первая часть фамилии). Третье слово (отчество)
    игнорируем, чтобы не выдавать лишнего PII.
    """
    if not full_name or not full_name.strip():
        return "Аноним"
    parts = full_name.strip().split()
    initials = [p[0].upper() for p in parts[:2] if p]
    if not initials:
        return "Аноним"
    return ". ".join(initials) + "."


def normalize_text_for_hash(text: str | None) -> str:
    """Канонизирует текст для дедуп-хеша: lowercase, схлопывание пробелов,
    удаление пунктуации. Используется только для сравнения, не для отображения."""
    if not text:
        return ""
    s = text.lower()
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"[^\w\s]", "", s, flags=re.UNICODE)
    return s


def hash_review_text(text: str | None) -> str:
    """sha256 от normalize_text_for_hash. Hex-строка длиной 64."""
    return hashlib.sha256(normalize_text_for_hash(text).encode("utf-8")).hexdigest()


def derive_sentiment_from_rating(rating: int | None) -> tuple[str, float]:
    """Fallback тональности по числовой оценке (до LLM-обработки).

    rating=None → ('neutral', 0.5) — нет данных, не пытаемся угадать.
    rating ≤ 2 → 'negative' (1.0 для оценки 1, 0.75 для оценки 2)
    rating == 3 → ('neutral', 0.5)
    rating ≥ 4 → 'positive' (0.5 для 4, 1.0 для 5)
    """
    if rating is None:
        return "neutral", 0.5
    if rating <= 2:
        return "negative", 1.0 - (rating - 1) * 0.25
    if rating == 3:
        return "neutral", 0.5
    return "positive", (rating - 3) * 0.5
