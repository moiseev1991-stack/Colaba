# Colaba -- Статус проекта

**Последнее обновление:** 18 марта 2026

---

## Сервисы

| Сервис | URL | Статус |
|--------|-----|--------|
| PostgreSQL | localhost:5432 | Работает (healthy) |
| Redis | localhost:6379 | Работает (healthy) |
| Backend API | localhost:8001 | Работает |
| Frontend | localhost:4000 | Работает |
| Celery Worker | -- | Работает |
| SQLAdmin | localhost:8001/admin | Работает |

---

## Реализовано

### Backend
- FastAPI приложение с модульной архитектурой
- Модели БД (13 таблиц): User, Organization, Search, SearchResult, SearchProviderConfig, AiAssistant, CaptchaBypassConfig, BlacklistDomain, Filter, Deployment, SocialAccount и др.
- JWT авторизация (httpOnly cookies), регистрация, refresh tokens
- OAuth авторизация: Google, Yandex, VK, Telegram
- Multi-tenancy с RBAC (OWNER, ADMIN, MEMBER)
- Интеграция с поисковыми провайдерами: DuckDuckGo (по умолчанию), Яндекс XML, Яндекс HTML, Google HTML
- Celery задачи: поиск, краулинг (до 20 страниц), SEO-аудит, извлечение контактов, генерация outreach
- Модули: tenders, payments, outreach
- AI-ассистенты (CRUD, реестр, chat/vision)
- Обход капчи (AI Vision, 2captcha, anticaptcha, Yandex SmartCaptcha)
- SQLAdmin админка (User, Organization, Search, Deployment)
- Система версионирования (semantic-release, Deployment модель)
- Health check endpoints (`/health`, `/ready`)

### Frontend
- Next.js 14 с App Router, TypeScript, Tailwind CSS
- Страницы: login/register (с OAuth), дашборды (SEO/Leads/Tenders), настройки (AI, провайдеры, капча, деплои)
- Адаптивный поллинг, пагинация, клиентский кэш
- Production build (`next build` + `next start`)

### DevOps
- Docker Compose (dev + prod + GHCR)
- GitHub Actions (CI, deploy, release)
- Alembic миграции (9 версий)
- semantic-release + Conventional Commits

---

## База данных

Текущая версия миграций: **009**

13 таблиц: users, organizations, user_organizations, searches, search_results, search_provider_config, ai_assistant, captcha_bypass_config, blacklist_domains, filters, deployments, social_accounts + celery таблицы.

---

## Что нужно для production

### Обязательно
1. OAuth credentials (Google, Yandex, VK, Telegram)
2. SQLAdmin аутентификация (только superuser)
3. Rate limiting для API

### Опционально
4. Мониторинг (Sentry или аналог)
5. Автоматический деплой через semantic-release
6. Отправка outreach (Email/Telegram/WhatsApp)
7. Модуль тендеров -- поиск на Goszakupki

---

## Известные проблемы

- Дашборд долго грузится (отмечено в плане)
- SEO/Leads/Тендеры выглядят неинтересно визуально (требуется редизайн)
- Мобильная версия требует доработки
- Rate limiting не настроен для production

---

## URL

- Frontend: http://localhost:4000
- Backend API: http://localhost:8001
- API Docs: http://localhost:8001/api/docs
- SQLAdmin: http://localhost:8001/admin
