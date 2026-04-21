# Colaba -- Статус проекта

**Последнее обновление:** 21 апреля 2026

---

## Сервисы

| Сервис | URL | Статус |
|--------|-----|--------|
| PostgreSQL | localhost:5433 → 5432 в контейнере | Работает (healthy) |
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
- Почта: кампании, логи, шаблоны, домены, ответы (IMAP), **глобальная конфигурация** `email_config` (Hyvor Relay или SMTP/IMAP из UI и SQLAdmin), API `/email/settings`, отправка через `EmailService` (в т.ч. outreach с передачей `db`)
- AI-ассистенты (CRUD, реестр, chat/vision)
- Обход капчи (AI Vision, 2captcha, anticaptcha, Yandex SmartCaptcha)
- SQLAdmin админка (User, Organization, Search, Deployment)
- Система версионирования (semantic-release, Deployment модель)
- Health check endpoints (`/health`, `/ready`)

### Frontend
- Next.js 14 с App Router, TypeScript, Tailwind CSS
- Страницы: login/register (с OAuth), дашборды (SEO/Leads/Tenders), настройки (AI, провайдеры, капча, деплои), **Настройка email** (`/app/email/settings`), рассылки и ответы
- Адаптивный поллинг, пагинация, клиентский кэш
- Production build (`next build` + `next start`)

### DevOps
- Docker Compose (dev + prod + GHCR)
- GitHub Actions (CI, deploy, release)
- Alembic миграции (в т.ч. email-таблицы и `email_config`, до ревизии **013**)
- semantic-release + Conventional Commits

---

## База данных

Актуальная ревизия Alembic: **013** (см. `backend/alembic/versions/`).

В числе прочего: users, organizations, searches, email-кампании/логи/шаблоны/домены, email_replies, **email_config** (singleton), deployments, social_accounts и др.

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

## Примечания (апрель 2026)

- После добавления pip-зависимостей (например `aiosmtplib`) нужна **пересборка** образа backend: `docker compose build backend` и пересоздание контейнера — иначе API не стартует, фронт через прокси показывает пустые данные.
- Локальный `npm run dev`: прокси Next.js по умолчанию бьёт в `http://127.0.0.1:8001` (см. `frontend/app/api/v1/[...path]/route.ts`); при необходимости задайте `INTERNAL_BACKEND_ORIGIN` в `frontend/.env.local`.
- Тесты backend: в `tests/conftest.py` задаётся `ENVIRONMENT=test`; в `pytest.ini` — `asyncio_default_fixture_loop_scope=session` (совместимость SQLAlchemy async + pytest-asyncio).

## URL

- Frontend: http://localhost:4000
- Backend API: http://localhost:8001
- API Docs: http://localhost:8001/api/docs
- SQLAdmin: http://localhost:8001/admin
