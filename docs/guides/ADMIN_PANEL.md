# Админ-панель Colaba

Руководство по встроенной админ-панели backend (SQLAdmin).

## Обзор

- **Технология:** [SQLAdmin](https://aminalaee.dev/sqladmin/) (админка для FastAPI + SQLAlchemy).
- **URL:** после запуска backend — `http://localhost:8000/admin/` (в Docker с маппингом портов — например `http://localhost:8001/admin/`).
- **Код:** `backend/app/admin/`.

### Важно: на сервере (Coolify / SpinLid)

Админка отдаётся **только процессом FastAPI (backend)**. Next.js на **www** маршрут `/admin` не реализует — будет 404.

1. В панели Coolify откройте сервис **backend** и посмотрите **публичный URL** или внутренний порт (часто `8000`).
2. Заходите в админку так:
   - **`https://<хост-API>/admin`** — например `https://api.spinlid.ru/admin`, если в Coolify у API задан поддомен `api`;
   - либо URL вида `https://<uuid>.sslip.io/admin`, если так выдан доступ к контейнеру;
   - **не** используйте `https://www.spinlid.ru/admin` — это фронт, не FastAPI.

**Вход:** в текущей сборке `Admin()` подключается без `authentication_backend` из `auth.py`, поэтому SQLAdmin может открываться **без отдельной формы логина** (доступ не защищён кодом — ограничьте доступ в Coolify: IP, Basic Auth у прокси, или закройте порт). Если позже включите `AdminAuth` + session middleware, понадобятся **email и пароль пользователя с `is_superuser=True`** в таблице `users`.

**Проверка, что это тот сервис:** в том же базовом URL должен открываться Swagger: `https://<хост-API>/api/docs` (если `DEBUG=True`) или `https://<хост-API>/health`.

## Разделы (модели)

В админке доступны:

| Раздел | Модель | Описание |
|--------|--------|----------|
| Users | `User` | Пользователи (email, активность, суперпользователь). |
| Organizations | `Organization` | Организации. |
| Social Accounts | `SocialAccount` | Привязки OAuth (Google, Yandex, VK, Telegram). |
| Searches | `Search` | Поисковые запросы (запрос, статус, пользователь, организация). |
| Search Results | `SearchResult` | Результаты поиска (заголовок, домен, SEO-оценка, контакты). |
| Blacklist Domains | `BlacklistDomain` | Домены в чёрном списке. |
| Search Provider Configs | `SearchProviderConfig` | Конфигурации провайдеров поиска (duckduckgo, yandex_html и т.д.). |
| AI Assistants | `AiAssistant` | AI-ассистенты (провайдер, модель, vision, default). |
| Captcha Bypass Configs | `CaptchaBypassConfig` | Настройки обхода капчи (AI, 2captcha, anticaptcha). |
| Deployments | `Deployment` | История деплоев (версия, git SHA, окружение, статус). |

## Человекочитаемое отображение

- Во всех моделях заданы `__str__`, поэтому в списках и в связях показываются короткие подписи (например «#1 - user@example.com», «#5 - example.com [completed]»), а не `<app.models.search.Search object at 0x...>`.
- В Admin Views настроены `column_formatters` и `column_labels`: статусы (Pending/Running/Completed), да/нет для булевых полей, сокращение длинных полей (query, title, url, changelog), отображение связей (user, organization, search) и enum’ов (environment, status, provider).

## Язык интерфейса (i18n)

- **По умолчанию:** русский.
- **Доступные языки:** русский (ru), английский (en).
- **Переключение:** cookie `admin_lang`. Endpoint: `GET /admin/set-language/{language}` (например `/admin/set-language/en`). После перехода по ссылке язык сохраняется в cookie и используется при следующих заходах в `/admin/`.
- **Код:** `backend/app/admin/i18n.py`, переводы в `backend/app/admin/locales/` (ru/en, .po и скомпилированные .mo). После правок .po нужно пересобрать .mo (скрипт `backend/app/admin/compile_translations.py` или `pybabel compile`).

## Структура кода

```
backend/app/admin/
├── __init__.py
├── main.py              # setup_admin(), регистрация views, middleware, endpoint смены языка
├── auth.py              # (при необходимости) аутентификация для админки
├── i18n.py              # gettext, текущий язык, set_language
├── compile_translations.py  # компиляция .po -> .mo
├── locales/
│   ├── ru/LC_MESSAGES/
│   │   ├── admin.po
│   │   └── admin.mo
│   └── en/LC_MESSAGES/
│       ├── admin.po
│       └── admin.mo
└── views/
    ├── __init__.py
    ├── users.py
    ├── organizations.py
    ├── social_accounts.py
    ├── searches.py
    ├── search_results.py
    ├── blacklist_domains.py
    ├── deployments.py
    ├── search_provider_configs.py
    ├── ai_assistants.py
    └── captcha_bypass_configs.py
```

## Зависимости

- В `backend/requirements.txt`: `sqladmin>=0.19.0`, `babel>=2.14.0`.

## Связанные документы

- Структура backend: [PROJECT_STRUCTURE_RULES.md](PROJECT_STRUCTURE_RULES.md).
- Развёртывание: [deployment/README.md](../deployment/README.md).
