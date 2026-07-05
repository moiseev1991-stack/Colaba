"""Метаданные провайдеров email для UI настроек.

Источник истины для frontend-страницы /app/settings/email-providers:
UI бэк-инжинирит схему полей из этого реестра (как maps-providers).

Структура одной записи:
- id: совпадает с EmailProviderConfig.provider_id в БД
- name: отображаемое имя
- description: что делает провайдер
- fields: список полей настроек (key, label, type, secret, default, description)
- default_cost_per_mail: цена за письмо по умолчанию (админ может менять)
- default_priority: 0=primary, 1=fallback, 2=tertiary

EmailProviderConfig в БД хранит значения по тем же ключам полей
(smtp_host, smtp_password, api_key, ...).
"""

from __future__ import annotations

EMAIL_PROVIDER_REGISTRY: list[dict] = [
    {
        "id": "postbox",
        "name": "Yandex Cloud Postbox",
        "description": (
            "Основной канал отправки. Лучшая доставляемость в Mail.ru/Yandex "
            "(одна экосистема, прямой FBL). AWS SES-совместимый SMTP-интерфейс. "
            "Получить ключ: console.yandex.cloud → Postbox."
        ),
        "default_cost_per_mail": 0.039,  # ~39₽/1000 писем
        "default_priority": 0,
        "fields": [
            {
                "key": "smtp_host",
                "label": "SMTP host",
                "type": "text",
                "secret": False,
                "required": True,
                "default": "postbox.cloud.yandex.net",
                "description": "Endpoint Postbox из консоли Yandex Cloud.",
            },
            {
                "key": "smtp_port",
                "label": "SMTP port",
                "type": "number",
                "secret": False,
                "required": True,
                "default": 587,
                "description": "587 (STARTTLS) или 465 (SSL).",
            },
            {
                "key": "smtp_user",
                "label": "SMTP user",
                "type": "text",
                "secret": False,
                "required": True,
                "description": "Обычно совпадает с from_email.",
            },
            {
                "key": "smtp_password",
                "label": "SMTP password",
                "type": "secret",
                "secret": True,
                "required": True,
                "description": "Пароль приложения Postbox из консоли Yandex Cloud.",
            },
            {
                "key": "from_email",
                "label": "Email отправителя",
                "type": "text",
                "secret": False,
                "required": True,
                "description": "Адрес на подтверждённом домене (SPF/DKIM настроены).",
            },
            {
                "key": "from_name",
                "label": "Имя отправителя",
                "type": "text",
                "secret": False,
                "required": False,
                "description": "Отображаемое имя («Иван, ООО Ромашка»).",
            },
        ],
    },
    {
        "id": "ses",
        "name": "Amazon SES",
        "description": (
            "Резервный канал. Дешевле Postbox (~$0.10/1000), но слабая "
            "репутация IP у Mail.ru/Yandex. Хорош для зарубежных ящиков (Gmail). "
            "Нужны IAM SMTP-кредентиалы и верифицированный домен."
        ),
        "default_cost_per_mail": 0.009,  # ~$0.10/1000 ≈ 0.009₽
        "default_priority": 1,
        "fields": [
            {
                "key": "smtp_host",
                "label": "SMTP endpoint",
                "type": "text",
                "secret": False,
                "required": True,
                "default": "email-smtp.eu-west-1.amazonaws.com",
                "description": "Формат: email-smtp.{region}.amazonaws.com.",
            },
            {
                "key": "smtp_port",
                "label": "SMTP port",
                "type": "number",
                "secret": False,
                "required": True,
                "default": 587,
                "description": "587 (STARTTLS) рекомендуется.",
            },
            {
                "key": "smtp_user",
                "label": "SMTP username (IAM)",
                "type": "text",
                "secret": False,
                "required": True,
                "description": "IAM SMTP credentials, создаётся в SES Console.",
            },
            {
                "key": "smtp_password",
                "label": "SMTP password",
                "type": "secret",
                "secret": True,
                "required": True,
                "description": "Пароль к IAM SMTP credentials.",
            },
            {
                "key": "region",
                "label": "AWS Region",
                "type": "text",
                "secret": False,
                "required": True,
                "default": "eu-west-1",
                "description": "Должен совпадать с регионом в smtp_host.",
            },
            {
                "key": "from_email",
                "label": "From email",
                "type": "text",
                "secret": False,
                "required": True,
                "description": "Должен быть на верифицированном домене SES.",
            },
            {
                "key": "from_name",
                "label": "Имя отправителя",
                "type": "text",
                "secret": False,
                "required": False,
            },
        ],
    },
    {
        "id": "hyvor",
        "name": "Hyvor Relay (собственный сервер)",
        "description": (
            "Self-hosted SMTP relay (контейнер leadgen-hyvor-relay). Полный "
            "контроль IP-репутации, не зависит от санкций/банов ESP. "
            "Использует HTTP-API вместо стандартного SMTP."
        ),
        "default_cost_per_mail": 0.0,  # self-hosted, бесплатно
        "default_priority": 2,
        "fields": [
            {
                "key": "smtp_host",
                "label": "API URL",
                "type": "text",
                "secret": False,
                "required": True,
                "default": "http://hyvor-relay:8000",
                "description": "URL внутреннего relay-сервиса.",
            },
            {
                "key": "api_key",
                "label": "API key",
                "type": "secret",
                "secret": True,
                "required": True,
                "description": "Bearer-токен для Authorization.",
            },
            {
                "key": "secret_key",
                "label": "Webhook secret",
                "type": "secret",
                "secret": True,
                "required": False,
                "description": "Для проверки подписи входящих webhook'ов.",
            },
            {
                "key": "from_email",
                "label": "From email",
                "type": "text",
                "secret": False,
                "required": False,
                "description": "Если пусто — берётся из настроек Hyvor Relay.",
            },
        ],
    },
]


def get_registry_entry(provider_id: str) -> dict | None:
    """Возвращает запись реестра по provider_id или None."""
    for entry in EMAIL_PROVIDER_REGISTRY:
        if entry["id"] == provider_id:
            return entry
    return None


def get_all_provider_ids() -> list[str]:
    """Список всех известных provider_id в порядке приоритета."""
    return [entry["id"] for entry in EMAIL_PROVIDER_REGISTRY]
