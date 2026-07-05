"""Метаданные провайдеров карт/отзывов для UI настроек.

Источник истины для frontend-страницы /app/settings/maps-providers:
UI бэк-инжинирит схему полей из этого реестра.

Структура одной записи:
- id: совпадает с PROVIDERS_REGISTRY в tasks.py и Company.source в БД
- name: отображаемое имя в UI
- description: что делает провайдер
- fields: список полей настроек (key, label, type, secret, required, description)
- source_label: что показывается в drawer'е компании как «Источник»

MapProviderConfig в БД хранит ключи по этим же ключам полей
(api_key, secondary_key).
"""

from __future__ import annotations

MAPS_PROVIDER_REGISTRY: list[dict] = [
    {
        "id": "twogis",
        "name": "2ГИС",
        "description": (
            "Каталог фирм + отзывы. Widget API как бесплатный fallback "
            "(если Catalog-ключа нет или лимит исчерпан)."
        ),
        "source_label": "2ГИС",
        "fields": [
            {
                "key": "api_key",
                "label": "Catalog API ключ",
                "type": "secret",
                "secret": True,
                "required": False,
                "description": "https://dev.2gis.ru — для поиска фирм и Catalog API.",
            },
            {
                "key": "secondary_key",
                "label": "Widget API ключ (public-api.reviews.2gis.com)",
                "type": "secret",
                "secret": True,
                "required": False,
                "description": (
                    "Берётся из DevTools 2gis.ru → Network → reviews?key=... "
                    "(виджет рейтинга на странице фирмы). Бесплатный fallback "
                    "для получения отзывов."
                ),
            },
        ],
    },
    {
        "id": "yandex_maps",
        "name": "Яндекс.Карты",
        "description": (
            "HTML-парсинг через Playwright с прокси. Официального API "
            "отзывов нет. Опционально — коммерческий ключ (если есть)."
        ),
        "source_label": "Я.Карты",
        "fields": [
            {
                "key": "secondary_key",
                "label": "Коммерческий API ключ (опционально)",
                "type": "secret",
                "secret": True,
                "required": False,
                "description": (
                    "https://yandex.ru/dev/maps/commercial — оставьте пустым "
                    "для бесплатного HTML-парсера через Playwright."
                ),
            },
        ],
    },
    {
        "id": "google_maps",
        "name": "Google Maps",
        "description": (
            "Через SerpAPI (engine=google_maps / google_maps_reviews). "
            "Платный: ~$75/мес за 5000 запросов. Из РФ работает через прокси."
        ),
        "source_label": "Google Maps",
        "fields": [
            {
                "key": "api_key",
                "label": "SerpAPI ключ",
                "type": "secret",
                "secret": True,
                "required": True,
                "description": "https://serpapi.com/dashboard — API key.",
            },
        ],
    },
]


def get_registry_entry(provider_id: str) -> dict | None:
    """Возвращает запись реестра по provider_id или None."""
    for entry in MAPS_PROVIDER_REGISTRY:
        if entry["id"] == provider_id:
            return entry
    return None


def get_all_provider_ids() -> list[str]:
    """Список всех известных provider_id."""
    return [entry["id"] for entry in MAPS_PROVIDER_REGISTRY]
