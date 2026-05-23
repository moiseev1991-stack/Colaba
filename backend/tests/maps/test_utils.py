"""Тесты utility-функций модуля maps."""

import pytest

from app.modules.maps.utils import (
    derive_sentiment_from_rating,
    hash_review_text,
    mask_author,
    normalize_text_for_hash,
)


@pytest.mark.parametrize(
    "full_name, expected",
    [
        (None, "Аноним"),
        ("", "Аноним"),
        ("   ", "Аноним"),
        ("Иван Иванов", "И. И."),
        ("Иван", "И."),
        ("Иван Иванов Иванович", "И. И."),  # отчество не используем
        ("анна петрова", "А. П."),
    ],
)
def test_mask_author(full_name, expected):
    assert mask_author(full_name) == expected


def test_normalize_text_for_hash_strips_punct_and_lowercases():
    assert normalize_text_for_hash("Привет, МИР!  ") == "привет мир"
    assert normalize_text_for_hash("foo\n\nbar") == "foo bar"
    assert normalize_text_for_hash(None) == ""
    assert normalize_text_for_hash("") == ""


def test_hash_review_text_deterministic_and_normalised():
    h1 = hash_review_text("Привет, мир!")
    h2 = hash_review_text("  привет  МИР  ")
    assert h1 == h2  # отличия в кейсе/пробелах/пунктуации сворачиваются
    assert len(h1) == 64  # sha256 hex


def test_hash_review_text_different_for_different_strings():
    assert hash_review_text("один") != hash_review_text("два")


@pytest.mark.parametrize(
    "rating, expected_label, expected_score",
    [
        (None, "neutral", 0.5),
        (1, "negative", 1.0),
        (2, "negative", 0.75),
        (3, "neutral", 0.5),
        (4, "positive", 0.5),
        (5, "positive", 1.0),
    ],
)
def test_derive_sentiment_from_rating(rating, expected_label, expected_score):
    label, score = derive_sentiment_from_rating(rating)
    assert label == expected_label
    assert score == pytest.approx(expected_score)
