# Colaba — Project Brief

**Дата документа:** 2026-05-21
**Версия приложения:** 1.2.0
**Назначение документа:** вводный brief для нового чата с LLM (Claude AI и др.). Загрузите этот файл в новый диалог — собеседник сразу получит контекст проекта, текущее состояние, стратегический выбор и список открытых задач.

---

## 1. Что такое Colaba

Colaba — B2B lead-generation платформа под российский рынок 2026. Архитектурно это конвейер:

> **поиск → краулинг → SEO-аудит → извлечение контактов → email-рассылка → парсинг ответов (IMAP) → AI-ассистенты → CRM-light**

плюс модуль госзакупок (`tenders`) и multi-tenancy с RBAC. По сути — собственный «комбайн» для холодного аутрича, частично замещающий связку Snov.io / Hunter / Apollo / Lemlist под РФ-специфику (Yandex, 2GIS, Hyvor Relay вместо Mailgun, обход рекапчи и SmartCaptcha).

---

## 2. Контекст автора и ограничений

- **Дима** — solo-фаундер. Без команды и без маркетингового бюджета.
- Рынок РФ 2026 — падающий: и у клиентов, и у автора нет денег на ads.
- Канал привлечения должен быть бесплатным: контент-SEO, Telegram-канал «прогонов», партнёрка 30%.
- Ниша на квартал **ещё не зафиксирована** (см. §7).
- Технически автор грамотный: понимает SPF/DKIM, прогрев домена, Postfix, Celery — упрощать не надо.

---

## 3. Технологический стек

### Backend
- **Python 3.11** + **FastAPI 0.104** (async)
- **SQLAlchemy 2.0** (async) + **Alembic** (актуальная ревизия — **014**)
- **PostgreSQL 16** (порт 5433 локально → 5432 в контейнере)
- **Redis 5** + **Celery 5.3** (6 воркеров, очереди: search, crawl, audit, contacts, outreach, replies)
- **SQLAdmin 0.19** — встроенная админка
- **slowapi** (rate limiting — пока не включён в prod)
- **JWT** (`python-jose`) + **bcrypt**, httpOnly cookies
- **fastapi-sso** — OAuth (Google, Yandex, VK, Telegram Login Widget)

### Frontend
- **Next.js 14.2** (App Router) + TypeScript 5.3
- **React 18.2**, **Tailwind CSS 3.4**
- **@tanstack/react-query 5.17**, **zustand 4.4**, **axios 1.6**, **lucide-react**
- Production-режим (`next build` + `next start`), порт **4000**

### Внешние интеграции и сервисы
- **Поиск:** DuckDuckGo (free) + Yandex XML/HTML + Google HTML — с фолбеком
- **Yandex Cloud Search API** (folder_id + API-ключ) — через `yandex-cloud-ml-sdk`
- **LLM:** OpenAI, Anthropic, Google Gemini, Ollama (локальный)
- **Email:** Hyvor Relay (SMTP-инфра РФ-friendly) + IMAP catch-all `reply-{user_id}@domain` для парсинга ответов
- **Captcha bypass:** AI Vision + 2captcha + anticaptcha + Yandex SmartCaptcha

### DevOps
- Docker Compose (dev / prod / GHCR)
- GitHub Actions: CI (тесты), deploy, semantic-release
- Conventional Commits + commitlint + husky
- Production на VPS (см. `docs/deployment/`)

---

## 4. Сервисы и порты (локально)

| Сервис | Адрес | Статус |
|---|---|---|
| Frontend (Next.js) | `http://localhost:4000` | работает |
| Backend (FastAPI) | `http://localhost:8001` | работает |
| API Docs (Swagger) | `http://localhost:8001/api/docs` | работает |
| SQLAdmin | `http://localhost:8001/admin` | работает (нет аутентификации — блокер) |
| PostgreSQL | `localhost:5433` | healthy |
| Redis | `localhost:6379` | healthy |
| Celery worker | — | работает (6 очередей) |

---

## 5. Что уже реализовано в коде

### Backend-модули (`backend/app/modules/`)
- `auth/` — JWT, регистрация, OAuth (Google / Yandex / VK / Telegram реализованы, **нет credentials в проде**)
- `searches/` — поиск с фолбеками, SearchProvider абстракция
- `providers/` — конфиги провайдеров поиска (DuckDuckGo / Yandex / Google)
- `filters/` — пользовательские фильтры по результатам
- `email/` — кампании, шаблоны, домены, IMAP-парсинг ответов, **DB-backed mail config** через `email_config` singleton + UI `/app/email/settings`
- `outreach/` — генерация писем, отправка через `EmailService` (Hyvor Relay)
- `ai_assistants/` — CRUD ассистентов, chat / vision endpoints, реестр моделей
- `captcha/` — обход капчи (4 движка)
- `organizations/` — multi-tenancy + RBAC (OWNER / ADMIN / MEMBER)
- `tenders/` — модуль госзакупок (**заложен, не достроен**)
- `payments/` — заложен, биллинг не интегрирован
- `dashboard/`, `monitor/` — статистика и наблюдение
- `deployments/` — история деплоев + Deployments API

### Frontend-разделы (`frontend/app/`)
`auth/`, `dashboard/`, `leads/` (включая `proposals/` — шаблоны КП), `seo/`, `tenders/`, `organizations/`, `profile/`, `settings/` (AI, провайдеры, капча, деплои, email), `monitor/`, `payment/`, `policy/`, `runs/`.

В корне `app/` есть `error.tsx` и `global-error.tsx`. API-прокси через `frontend/app/api/v1/[...path]/route.ts` → `INTERNAL_BACKEND_ORIGIN` (по умолчанию `http://127.0.0.1:8001`).

### База данных (Alembic ревизия 014)
13+ таблиц: `users`, `organizations`, `searches`, `search_results`, `search_result_pages`, `search_provider_configs`, `ai_assistants`, `captcha_bypass_configs`, `blacklist_domains`, `filters`, `deployments`, `social_accounts`, `email_campaigns`, `email_logs`, `email_templates`, `email_domains`, `email_replies`, `email_config` (singleton).

---

## 6. Что НЕ работает / блокеры до первых продаж

Из [docs/Plan_2026-05-03.md](Plan_2026-05-03.md) — главный стратегический срез автора. Эти 6 пунктов блокируют монетизацию:

1. **Self-service биллинг** — ЮKassa / CloudPayments + рекуррентка + лимиты тарифов **enforced в коде**. Сейчас pricing — статичная секция; лимиты в БД не проверяются.
2. **Onboarding за 60 секунд** — регистрация → готовый «рецепт» поиска → первые 10 лидов без настройки. Сейчас новичок попадает в дашборд из 6 разделов и теряется.
3. **Доменная инфра для cold email** — SPF / DKIM / DMARC + warm-up + ротация доменов + bounce / complaint handling. Hyvor Relay есть, но UI для 5 доменов «под отправителя» нет.
4. **Demo-аккаунт / песочница** — без захода внутрь B2B-клиент в РФ 2026 не зарегается.
5. **2–3 публичных кейса** — «было / стало», скриншоты, цифры.
6. **Security hygiene** — SQLAdmin закрыть авторизацией (только superuser), включить Sentry, включить rate limiting.

### Что вырезать (для solo это важнее, чем добавить)
- OAuth VK и Telegram Login Widget — B2B так не логинятся. Оставить Email + Yandex.
- AI-ассистентов как раздел — это внутренний инструмент, спрятать в шестерёнки.
- WhatsApp в roadmap — для РФ B2B не нужен (Meta-блок).
- Госзакупки и SEO-аудит — две разные продуктовые сущности. **Выбрать одну на старт.**

---

## 7. Стратегический выбор (открытый)

**Одна ниша на квартал.** Варианты:

| Ниша | TAM в РФ | Готовая привычка платить | Что под неё переиспользуем |
|---|---|---|---|
| **SEO-агентства / частные SEO** | ~3–5 тыс. компаний | средне (Topvisor, Serpstat) | SEO-аудит + контакты → готовый КП |
| **Тендерные специалисты** | большой | высокая ($50–200/мес уже платят Synapsenet/Тендерплан/СБИС) | модуль `tenders` + мониторинг закупок |
| **Веб-студии** | средний | средне | краулер → сайты без SSL / мобильной версии = список клиентов |

**Рекомендация плана:** SEO-агентства или тендерщики (привычка платить).

---

## 8. План 30 / 60 / 90 дней (по состоянию на 2026-05-03)

### 30 дней — превратить движок в покупаемый MVP
- [ ] Выбрать одну нишу
- [ ] Удалить из UI всё, что не относится к нише
- [ ] Demo-аккаунт с предзагруженными данными
- [ ] ЮKassa интеграция + 2 тарифа (free 50 лидов/мес, paid 2900 ₽ / 5000 лидов)
- [ ] Onboarding-tour из 3 шагов
- [ ] SQLAdmin закрыть авторизацией, Sentry подключить (free tier)

### 60 дней — найти первых платящих
- [ ] Telegram-канал с публичными «прогонами» (2 поста / нед.)
- [ ] 3 кейса на сайте (даже по знакомым)
- [ ] Партнёрская программа (UTM + промокоды)
- [ ] Email warm-up для Hyvor Relay (1 домен, 4 недели прогрева)
- [ ] Cold outreach самих себя: 200 агентств вашим же продуктом → demo-call

### 90 дней — unit-экономика
- [ ] CAC и LTV на 5–10 платящих
- [ ] Юридика: оферта, политика 152-ФЗ
- [ ] Решение: PMF есть → масштабируем; нет → меняем ICP

---

## 9. Потенциальные расширения (приоритеты)

Все расширения переиспользуют ≥80% существующей инфры (Celery, captcha, search, AI, Hyvor):

| # | Расширение | Сложность | ROI | Приоритет |
|---|---|---|---|---|
| **A** | **Парсинг карт (2GIS / Я.Карты / Google Places)** | низкая | очень высокий | **СЕЙЧАС** |
| **C** | **Tender autobid (госзакупки)** | средняя | очень высокий | **СЕЙЧАС**, если ниша |
| E | AI-генерация КП | низкая | высокий | после MVP |
| J | CRM-light | низкая | высокий | после MVP |
| G | Enrichment (List-org / Контур.Фокус) | низкая | средний | после MVP |
| B | Авто-заполнение форм заявок | средняя | высокий | требует юр. проработки |
| F | Web monitoring / change detection | средняя | средний | как доп. SKU |
| I | SEO Rank Tracker | низкая | средний | если ниша SEO |
| D | Reputation monitoring | средняя | средний | отдельная ниша |
| H | AI Voice Sales Agent (звонки) | высокая | высокий | через 6–12 мес |

**Принципы выбора:**
1. Не строить вширь, пока нет 5 платящих.
2. Расширение должно использовать ≥80% существующего кода.
3. Каждое расширение должно дать новый SKU или поднять ARPU.
4. Tender / карты / формы — три самостоятельных продукта; не пытаться продать одному клиенту все три.

---

## 10. Что вы (LLM-собеседник) можете для меня делать

Если вы — Claude AI в браузере и я загрузил этот файл, я ожидаю помощи в:

- **Стратегические дискуссии**: выбор ниши, позиционирование, ценообразование, юр. риски.
- **Инфографика и визуализация**: схемы архитектуры, воронки, дорожные карты, сравнительные таблицы по нишам / конкурентам.
- **Тексты**: лендинг, посты для Telegram-канала, шаблоны cold email под выбранную нишу, описание тарифов, оферта.
- **Анализ конкурентов**: Snov.io, Apollo, Lemlist, Topvisor, Synapsenet, Тендерплан, СБИС — что есть у них, чего нет у меня и наоборот.
- **Декомпозиция задач**: разбить блокер №1 / №2 / №3 на конкретные тикеты, оценить сроки solo-разработки.
- **Чек-листы**: что должно быть на лендинге, что в onboarding-tour, что в политике 152-ФЗ.

**Чего НЕ нужно:**
- Писать код — для этого есть Claude Code локально.
- Уговаривать всё переписывать на другой стек — стек зафиксирован.
- Предлагать «нанять команду» / «привлечь инвестиции» — я solo и без бюджета намеренно.

---

## 11. Ссылки на исходные документы в репозитории

- **Стратегический план:** `docs/Plan_2026-05-03.md`
- **Статус сервисов:** `docs/STATUS.md`
- **Дорожная карта:** `docs/ROADMAP.md`
- **Email-replies setup:** `docs/email-replies-setup.md`
- **План развития 2026:** `docs/планы/план_развития_проекта_2026.md`
- **Шаблоны КП SEO:** `docs/планы/шаблоны-кп-seo-2026-03.md`
- **Аудит фронтенда 2025-03:** `docs/планы/аудит-фронтенда-2025-03-06.md`
- **Гайды:** `docs/guides/`
- **Изменения по фичам:** `docs/changes/`

---

*Документ собран 2026-05-21 для использования как контекстный prompt в новых чатах с LLM. При значительных изменениях в проекте — перегенерировать.*
