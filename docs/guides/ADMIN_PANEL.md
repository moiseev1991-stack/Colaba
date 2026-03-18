# Админ-панель Colaba

Руководство по встроенной админ-панели backend (SQLAdmin).

## Обзор

- **Технология:** [SQLAdmin](https://aminalaee.dev/sqladmin/) (админка для FastAPI + SQLAlchemy).
- **URL:** после запуска backend — `http://localhost:8000/admin/` (в Docker с маппингом портов — например `http://localhost:8001/admin/`).
- **Код:** `backend/app/admin/`.

### Важно: на сервере (Coolify)

Админка отдаётся **только backend'ом**. Фронт (Next.js) на основном домене не знает путь `/admin`, поэтому даёт 404.

- **Правильно:** открывать админку по домену **API**, а не по домену фронта:
  - `https://api.ваш-домен.com/admin` (подставьте свой поддомен API).
- **Неправильно:** `https://ваш-домен.com/admin` — запрос уходит во фронт → «This page could not be found».

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
