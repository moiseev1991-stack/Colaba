"""
Реестр провайдеров поиска: id, name, type, description, settings_schema.
"""

PROVIDER_REGISTRY = [
    {
        "id": "duckduckgo",
        "name": "DuckDuckGo",
        "type": "free",
        "description": "Бесплатный поиск, без ключа. Низкий риск блокировок.",
        "settings_schema": [
            {"key": "region", "label": "Регион", "type": "string", "required": False, "secret": False, "description": "Код региона (напр. ru-en)"},
        ],
    },
    {
        "id": "yandex_html",
        "name": "Яндекс HTML",
        "type": "free",
        "description": "Парсинг HTML поиска Яндекса. Возможны блокировки без прокси.",
        "settings_schema": [
            {"key": "use_proxy", "label": "Использовать прокси", "type": "bool", "required": False, "secret": False, "description": "Включить прокси для запросов"},
            {"key": "proxy_url", "label": "Прокси (один)", "type": "string", "required": False, "secret": False, "description": "http://host:port или socks5://host:port"},
            {"key": "proxy_list", "label": "Список прокси", "type": "string", "required": False, "secret": False, "description": "Через запятую для ротации"},
            {"key": "use_mobile", "label": "Мобильный URL", "type": "bool", "required": False, "secret": False, "description": "Использовать мобильную версию поиска"},
        ],
    },
    {
        "id": "google_html",
        "name": "Google HTML",
        "type": "free",
        "description": "Парсинг HTML поиска Google. Высокий риск блокировок, желателен прокси.",
        "settings_schema": [
            {"key": "use_proxy", "label": "Использовать прокси", "type": "bool", "required": False, "secret": False, "description": "Включить прокси для запросов"},
            {"key": "proxy_url", "label": "Прокси (один)", "type": "string", "required": False, "secret": False, "description": "http://host:port или socks5://host:port"},
            {"key": "proxy_list", "label": "Список прокси", "type": "string", "required": False, "secret": False, "description": "Через запятую для ротации"},
        ],
    },
    {
        "id": "yandex_xml",
        "name": "Яндекс XML",
        "type": "paid",
        "description": "Yandex Cloud Search API: folder_id + API-ключ сервисного аккаунта. Дока: yandex.cloud/ru/docs/search-api/quickstart",
        "settings_schema": [
            {"key": "folder_id", "label": "Идентификатор каталога", "type": "string", "required": True, "secret": False, "description": "Folder ID из Yandex Cloud, в котором создан сервисный аккаунт"},
            {"key": "api_key", "label": "API-ключ", "type": "string", "required": True, "secret": True, "description": "API-ключ сервисного аккаунта (yandex.cloud)"},
        ],
    },
    {
        "id": "serpapi",
        "name": "SerpAPI",
        "type": "paid",
        "description": "Платный API поиска (Google и др.). Требуется api_key.",
        "settings_schema": [
            {"key": "api_key", "label": "API Key", "type": "string", "required": True, "secret": True, "description": "Ключ SerpAPI"},
        ],
    },
]
