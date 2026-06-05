"""Тесты utility-функций модуля maps."""

import pytest

from app.modules.maps.utils import (
    derive_sentiment_from_rating,
    extract_city_from_address,
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


@pytest.mark.parametrize(
    "address, fallback, expected",
    [
        # Запрошенный город есть в адресе — возвращаем его, не ищем дальше.
        ("г. Химки, ул. Ленинградская, 1", "Химки", "Химки"),
        ("Москва, Тверская, 5", "Москва", "Москва"),
        # Утечка: Yandex для запроса «Химки» вернул компанию из Балашихи.
        ("г. Балашиха, ул. Кирова, 7", "Химки", "Балашиха"),
        ("Мытищи, Ярославское шоссе, 12", "Химки", "Мытищи"),
        # Утечка под запрос «Москва» — компания в Подмосковье.
        ("Реутов, Юбилейный проспект, 60", "Москва", "Реутов"),
        # Адрес пустой / None — fallback на запрошенный.
        (None, "Химки", "Химки"),
        ("", "Химки", "Химки"),
        # Адрес не содержит ни одного известного города — fallback.
        ("ул. Центральная, 1", "Химки", "Химки"),
        # Word-boundary: «Пушкино» не должно матчиться как «Пушкин» (СПб).
        ("г. Пушкино, ул. Центральная", "Москва", "Пушкино"),
        # Регистронезависимо.
        ("БАЛАШИХА, шоссе Энтузиастов", "Химки", "Балашиха"),
        # Двусоставное название.
        ("Нижний Новгород, Большая Покровская, 1", "Москва", "Нижний Новгород"),
    ],
)
def test_extract_city_from_address(address, fallback, expected):
    assert extract_city_from_address(address, fallback) == expected
