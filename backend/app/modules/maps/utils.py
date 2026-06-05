"""Утилиты модуля maps.

mask_author        — анонимизация имени автора отзыва (152-ФЗ)
normalize_text_for_hash — приведение к каноничному виду для дедупа
hash_review_text   — sha256 нормализованного текста
derive_sentiment_from_rating — fallback тональности до LLM-обработки
extract_city_from_address — реальный город по строке адреса (анти-утечка городов)
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


# Список городов, по которым опознаём реальное местоположение компании в
# строке адреса (Yandex/2GIS возвращают `"г. Балашиха, ул. Кирова, 5"` или
# `"Балашиха, ул. ..."`).
#
# Покрытие: топ-50 РФ по населению + крупнейшие сателлиты Москвы/СПб.
# Сателлиты критичны: Yandex для запроса «Химки» легко вернёт компанию
# из Балашихи или Мытищ, и без этой проверки она сохранится с city='Химки'.
#
# Регистронезависимое сравнение. Двусоставные названия («Нижний Новгород»,
# «Сергиев Посад») сохраняются как есть — regex с word-boundary матчит их
# целиком.
_KNOWN_RUSSIAN_CITIES: tuple[str, ...] = (
    # Топ-50 РФ по населению
    "Москва", "Санкт-Петербург", "Новосибирск", "Екатеринбург", "Казань",
    "Нижний Новгород", "Челябинск", "Красноярск", "Самара", "Уфа",
    "Ростов-на-Дону", "Омск", "Краснодар", "Воронеж", "Пермь",
    "Волгоград", "Ижевск", "Иркутск", "Тюмень", "Хабаровск",
    "Владивосток", "Томск", "Оренбург", "Кемерово", "Рязань",
    "Тула", "Пенза", "Липецк", "Ярославль", "Барнаул",
    "Ставрополь", "Сочи", "Калининград", "Новокузнецк", "Архангельск",
    "Владимир", "Тверь", "Иваново", "Брянск", "Белгород",
    "Курск", "Симферополь", "Севастополь", "Грозный", "Сургут", "Тольятти",
    # Крупнейшие сателлиты Москвы (топ-20 МО по населению)
    "Балашиха", "Подольск", "Химки", "Мытищи", "Королёв", "Королев",
    "Люберцы", "Электросталь", "Красногорск", "Одинцово", "Серпухов",
    "Орехово-Зуево", "Ногинск", "Щёлково", "Щелково", "Жуковский",
    "Раменское", "Сергиев Посад", "Долгопрудный", "Реутов", "Пушкино",
    "Домодедово", "Видное", "Дубна", "Лобня",
    # Крупнейшие сателлиты СПб (Ленинградская область)
    "Гатчина", "Выборг", "Сосновый Бор", "Всеволожск", "Тихвин",
)


def extract_city_from_address(address: str | None, fallback_city: str) -> str:
    """Достаёт реальный город из строки адреса.

    Зачем: Yandex/2GIS-провайдеры при поиске по городу могут вернуть компании
    из соседних населённых пунктов (Yandex для запроса «Химки» возвращает
    компанию в Балашихе). Без этой функции `company.city` = запрошенный город,
    и фильтр утечки в `get_search_results` не отлавливает её.

    Логика:
      1) если `address` содержит запрошенный город → возвращаем его (запрос
         корректный, не трогаем);
      2) если содержит другой город из `_KNOWN_RUSSIAN_CITIES` → возвращаем
         его (вероятная утечка соседнего города);
      3) если адрес пустой или не распознан → fallback на запрошенный.

    Поиск регистронезависимый с word-boundary, чтобы «Пушкино» не матчилось
    как «Пушкин».
    """
    if not address:
        return fallback_city
    fallback_norm = fallback_city.strip().lower()
    addr_lower = address.lower()

    # Сначала пробуем запрошенный город — это самый быстрый happy path и
    # одновременно защита от ложно-положительного матча города-омонима
    # (например, «Пушкин» в питерской выдаче не должен подменять «Пушкино»).
    if fallback_norm and re.search(
        rf"\b{re.escape(fallback_norm)}\b", addr_lower, flags=re.UNICODE
    ):
        return fallback_city

    for city in _KNOWN_RUSSIAN_CITIES:
        c_norm = city.lower()
        if c_norm == fallback_norm:
            continue
        if re.search(rf"\b{re.escape(c_norm)}\b", addr_lower, flags=re.UNICODE):
            return city

    return fallback_city


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
