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
            "(одна экосистема, прямой FBL). SMTP-интерфейс с авторизацией "
            "через API-ключ (НЕ email+пароль). Подготовка в Yandex Cloud: "
            "сервисный аккаунт с ролью postbox.sender, API-ключ с областью "
            "yc.postbox.send, верифицированный адрес отправителя."
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
                "description": "Endpoint Postbox из консоли Yandex Cloud (фиксированный).",
            },
            {
                "key": "smtp_port",
                "label": "SMTP port",
                "type": "number",
                "secret": False,
                "required": True,
                "default": 587,
                "description": "587 (STARTTLS) — единственный поддерживаемый Postbox.",
            },
            {
                "key": "smtp_user",
                "label": "ID API-ключа",
                "type": "text",
                "secret": False,
                "required": True,
                "description": (
                    "Идентификатор API-ключа из консоли Yandex Cloud. "
                    "Не путать с email — это строка вида VQJSKIA1XXXXX. "
                    "Создаётся: console.yandex.cloud → Postbox → API-ключи "
                    "(область yc.postbox.send)."
                ),
            },
            {
                "key": "smtp_password",
                "label": "Секрет API-ключа",
                "type": "secret",
                "secret": True,
                "required": True,
                "description": (
                    "Секретная часть API-ключа (показывается один раз при создании). "
                    "Используется как SMTP-пароль вместе с ID ключа."
                ),
            },
            {
                "key": "from_email",
                "label": "Адрес отправителя (верифицированный)",
                "type": "text",
                "secret": False,
                "required": True,
                "description": (
                    "Адрес, созданный и подтверждённый в Postbox "
                    "(например hello@moy-domen.ru). Домен должен иметь "
                    "настроенные SPF/DKIM записи."
                ),
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
    {
        "id": "timeweb",
        "name": "Timeweb (SMTP, прогрев)",
        "description": (
            "Канал на новом домене spinlid-team.ru. Классический SMTP с "
            "авторизацией по email+пароль (в отличие от Postbox/SES, где "
            "ключи API). Домен на прогреве — ограничен daily_limit "
            "(10-15 писем/день первую неделю, далее 20-30). Хорош для "
            "расхлопывания новой репутации без риска для основного домена."
        ),
        "default_cost_per_mail": 0.0,  # собственный ящик, бесплатно
        "default_priority": 3,
        "fields": [
            {
                "key": "smtp_host",
                "label": "SMTP host",
                "type": "text",
                "secret": False,
                "required": True,
                "default": "smtp.timeweb.ru",
                "description": "SMTP-сервер Timeweb.",
            },
            {
                "key": "smtp_port",
                "label": "SMTP port",
                "type": "number",
                "secret": False,
                "required": True,
                "default": 2525,
                "description": (
                    "2525 (STARTTLS) — рекомендуется для VPS, где заблокированы "
                    "25/465/587; 465 (implicit SSL) — если порты открыты; "
                    "587 (STARTTLS) — альтернатива."
                ),
            },
            {
                "key": "smtp_user",
                "label": "Логин (email ящика)",
                "type": "text",
                "secret": False,
                "required": True,
                "default": "dmitry@spinlid-team.ru",
                "description": (
                    "Адрес почтового ящика на Timeweb. Это логин для SMTP — "
                    "в отличие от Postbox/SES, где smtp_user = ID API-ключа."
                ),
            },
            {
                "key": "smtp_password",
                "label": "Пароль",
                "type": "secret",
                "secret": True,
                "required": True,
                "description": "Пароль от почтового ящика (не API-ключ).",
            },
            {
                "key": "smtp_use_ssl",
                "label": "SSL (порт 465)",
                "type": "bool",
                "secret": False,
                "required": False,
                "default": False,
                "description": (
                    "True = implicit SSL (порт 465). False = STARTTLS (порты "
                    "587 или 2525). Должно совпадать с выбранным портом."
                ),
            },
            {
                "key": "from_email",
                "label": "From email",
                "type": "text",
                "secret": False,
                "required": True,
                "default": "dmitry@spinlid-team.ru",
                "description": "Адрес отправителя. Обычно = smtp_user.",
            },
            {
                "key": "from_name",
                "label": "Имя отправителя",
                "type": "text",
                "secret": False,
                "required": False,
                "description": "Отображаемое имя («Дмитрий, SpinLid»).",
            },
            {
                "key": "daily_limit",
                "label": "Дневной лимит (прогрев)",
                "type": "number",
                "secret": False,
                "required": False,
                "default": 12,
                "description": (
                    "Максимум писем в сутки через этот канал (защита нового "
                    "домена от попадания в спам). Проверяется в массовой "
                    "KP-рассылке: при достижении лимита отправка переходит к "
                    "следующему провайдеру. 0 или пусто = без лимита. "
                    "Рекомендация для прогрева: неделя 1 — 10-15/день, "
                    "неделя 2 — 20-30/день."
                ),
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
