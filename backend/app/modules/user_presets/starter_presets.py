"""Стартовые (системные) пресеты фильтров для модуля maps.

Видны всем пользователям в `/user-presets/starter`. Юзер может
склонировать пресет к себе через POST /user-presets/starter/{slug}/clone —
после клонирования получается обычная пользовательская запись, которую
можно редактировать и удалять.

Сами стартовые пресеты неизменяемы (хардкод в коде, не в БД), поэтому
их нельзя случайно удалить или перезаписать.

Slug-ID — машинно-читаемое имя; они отдаются на фронт как идентификатор
для клона, никогда не пересекаются с числовыми ID БД (используем отдельный
namespace).
"""
from __future__ import annotations

from typing import Any


StarterPreset = dict[str, Any]


STARTER_PRESETS: list[StarterPreset] = [
    {
        "slug": "horyachie-otzyvy",
        "name": "Горячие — с активными жалобами",
        "description": (
            "Компании со средним рейтингом 3.0–4.2 и большим количеством "
            "отзывов. В таких карточках обычно есть конкретные жалобы — "
            "идеальная зацепка для письма."
        ),
        "filter": {
            "min_rating": 3.0,
            "max_rating": 4.2,
            "min_reviews": 20,
            "min_negative": 3,
        },
        "ai_prompt": (
            "Оцени по отзывам, насколько компании нужна помощь с обслуживанием "
            "клиентов / репутацией. Score 1-10, обоснуй цитатами из отзывов."
        ),
    },
    {
        "slug": "bez-saita",
        "name": "Без собственного сайта",
        "description": (
            "Карточки 2GIS/Яндекс.Карт без поля website или с пустым доменом. "
            "Идеальный сегмент для услуг по созданию сайта и веб-маркетингу."
        ),
        "filter": {
            "has_website": False,
            "min_reviews": 5,
        },
        "ai_prompt": None,
    },
    {
        "slug": "vladelets-otvechaet",
        "name": "Владелец отвечает на отзывы",
        "description": (
            "Карточки, где владелец активно отвечает на отзывы — он "
            "вовлечён в бизнес, на письмо тоже скорее всего ответит. "
            "Подходит для B2B-предложений."
        ),
        "filter": {
            "has_owner_replies": True,
            "min_reviews": 10,
            "min_rating": 4.0,
        },
        "ai_prompt": None,
    },
    {
        "slug": "premium-segment",
        "name": "Премиум-сегмент",
        "description": (
            "Высокий рейтинг (4.5+) и большой отзывной фон (50+). "
            "Это устойчивые игроки с бюджетом — подходят для премиальных "
            "услуг и долгосрочных контрактов."
        ),
        "filter": {
            "min_rating": 4.5,
            "min_reviews": 50,
        },
        "ai_prompt": None,
    },
]


def list_starter_presets() -> list[StarterPreset]:
    """Возвращает все стартовые пресеты. Read-only."""
    return list(STARTER_PRESETS)


def get_starter_by_slug(slug: str) -> StarterPreset | None:
    """Находит стартовый пресет по slug. None если нет."""
    for p in STARTER_PRESETS:
        if p["slug"] == slug:
            return p
    return None
