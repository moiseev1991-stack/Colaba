# Colaba — Статус проекта

**Последнее обновление:** 5 июля 2026
**Текущая версия:** v1.119.0
**Коммитов:** 852 | **Миграций Alembic:** 045 | **Моделей БД:** 47+

---

## 1. Сервисы

| Сервис | URL | Статус |
|--------|-----|--------|
| PostgreSQL (pgvector/pg16) | localhost:5433 → 5432 в контейнере | ✅ Работает |
| Redis 7 | localhost:6379 | ✅ Работает |
| Backend API (FastAPI) | localhost:8001 | ✅ Работает |
| Frontend (Next.js 14) | localhost:4000 | ✅ Работает |
| Celery Worker (6+ очередей) | — | ✅ Работает |
| SQLAdmin | localhost:8001/admin | ✅ Работает (auth добавлена) |
| API Docs (Swagger) | localhost:8001/api/docs | ✅ Работает (только DEBUG) |
| Прод (Coolify) | spinlid.ru | ✅ Работает |

---

## 2. Что было запланировано (ROADMAP.md, 18 марта)

### 2.1. Краткосрочные цели ✅ — ВСЁ РЕАЛИЗОВАНО

| Пункт плана | Статус | Где сделано |
|-------------|--------|-------------|
| Редизайн навигации (меню "Оплата" и "Конфигурация") | ✅ | Sidebar redesign + mobile tabs (v1.42–1.55) |
| Визуальное улучшение модулей (SEO, Leads, Тендеры) | ✅ | Redesign v2 Phase A/B/C — полный переезд на новые токены |
| Мобильная версия | ✅ | Responsive layout, slim sidebar, header tabs (v1.30–1.53) |
| Посадочная страница (Landing) | ✅ | Hero + Benefits + FAQ + Demo + Pricing (v1.0+) |
| Оптимизация дашборда | ⚠️ | Poll-based loading есть, но загрузка всё ещё медленная |

### 2.2. Среднесрочные цели — ЧАСТИЧНО

| Пункт плана | Статус | Комментарий |
|-------------|--------|-------------|
| Email-рассылки | ✅ | Полный цикл: кампании, шаблоны, домены, IMAP-ответы, Hyvor Relay |
| Telegram-рассылки | ❌ | Сознательно убрано из приоритетов (B2B в РФ не канал) |
| WhatsApp-рассылки | ❌ | Сознательно убрано (Meta-блок в РФ) |
| Модуль тендеров (Госзакупки) | ❌ | Модуль заложен, **не достроен**, на паузе |
| Rate limiting для API | ❌ | `slowapi` установлен, но не включён в prod |
| SQLAdmin аутентификация | ✅ | Добавлена в v1.49.2 |
| OAuth credentials (Google, Yandex, VK, TG) | ⚠️ | Код готов, провайдеры — частично настроены |
| Мониторинг (Sentry) | ✅ | Интегрирован в v1.49.2 |

### 2.3. Долгосрочные цели — ЧАСТИЧНО

| Пункт плана | Статус | Комментарий |
|-------------|--------|-------------|
| Тарифы, подписки, пакеты | ✅ | Новые pricing tiers (v1.63) |
| Оплата (счета/чеки) | ❌ | Не интегрировано |
| Google PageSpeed | ❌ | Не оптимизировалось |
| Брендинг (лого, цвета, шрифты) | ✅ | BrandMark, mesh-blobs, новый логотип (v1.61–1.66) |
| Права доступа между партнёрами | ❌ | Есть multi-tenancy, но обмен лидами не готов |
| Юридическая часть (политика, оферта, согласия) | ✅ | Правовые страницы + cookie-баннер + privacy policy (v1.55) |

---

## 3. Что добавилось В ПРОЦЕССЕ (не было в изначальном плане)

Проект кардинально изменил фокус: от горизонтального «поиск + SEO + email» к **глубокому Maps-пайплайну с AI-диагностикой болей**.

### 🗺️ 3.1. Модуль Maps (карты) — ГЛАВНАЯ ФИЧА 2026

| Фича | Версия | Описание |
|------|--------|----------|
| 2GIS Catalog API | v1.3 | Парсер 2ГИС (компании + отзывы) |
| Yandex Maps (JSON-LD + AJAX + SmartCaptcha bypass) | v1.3 | Парсер Яндекс.Карт |
| Multi-source architecture (2GIS + Яндекс) | v1.46–1.48 | Склейка companies, company_sources, company_contacts |
| Playwright для Яндекс.Карт | v1.45 | Headless Chromium парсинг |
| 2GIS HTML-парсер (бесплатный) | v1.25 | Fallback через headless Chromium |
| SSE live-progress | v1.10 | Карточки появляются по мере парсинга (Redis pub/sub) |
| Multi-city × Multi-niche поиск | v1.68 | Массовый прогон N городов × M ниш |
| Поиск в радиусе от адреса | v1.12 | Конкурентный режим поиска |
| URL-persistence фильтров | v1.48 | `?src=`, `?map_search_id=` |
| Фильтр источника (2GIS / Яндекс) | v1.48 | Переключение с дедуп-склейкой |
| Bulk CSV экспорт | v1.49 | С BOM + `;` разделителем для Excel |

### 🤖 3.2. AI-анализ отзывов (Reviews AI)

| Фича | Версия | Описание |
|------|--------|----------|
| Sentiment-анализ (gpt-4o-mini) | v1.4 | Батчинг по 20, байпас капчи |
| Embeddings отзывов (text-embedding-3-small) | v1.4 | Векторный поиск pgvector |
| Кластеризация болей (pain tags) | v1.4 | LLM-naming тегов |
| Пресеты фильтров по ICP | v1.13–1.15 | «Нужен сайт», «Хаос в работе» |
| AI-промпты в пресетах | v1.21 | Кастомная оценка через LLM |
| Облако болей всей ниши | v1.67 | Агрегированный AI-диагноз по выдаче |
| AI-описание компании | v1.32 | Для блока «Производство сайта» |

### 👤 3.3. ЛПР (Лица, принимающие решения)

| Фича | Версия | Описание |
|------|--------|----------|
| DaData: ИНН/оборот/возраст | v1.33 | Юр.данные в drawer карточки |
| DaData: ФИО директора | v1.50 | Подстановка в outreach |
| LLM-извлечение ЛПР со страниц сайта | v1.51 | Парсинг /team /о-нас /контакты |
| Bulk enrich team | v1.67 | POST /companies/enrich-team |
| Website discovery | v1.35 | Угадывание сайта по telegram/email handle |

### 🌡️ 3.4. Скоринг и визуализация

| Фича | Версия | Описание |
|------|--------|----------|
| Lead Temperature Scoring | v1.30 | Горячий/тёплый/холодный с бейджем |
| Website-lead score | v1.31 | Оценка качества сайта |
| Тепловые карты (heatmap, 5 слоёв) | v1.35–1.52 | Leaflet + self-hosted heat |
| Легенда бейджей/теплокарты | v1.37 | Цитаты негативных отзывов в карточке |

### 🎨 3.5. Редизайн и лендинги

| Фича | Версия | Описание |
|------|--------|----------|
| Redesign v2 — токены, шрифты, компоненты | v1.38 | Базовый слой дизайн-системы |
| Redesign v2 Phase B — дашборд, навбар, сайдбар | v1.39–1.42 | Новый язык визуала |
| Redesign v2 Phase C — все страницы | v1.43 | 9 батчей полного переезда |
| 6 SEO-лендингов (public pages) | v1.55 | sitemap/robots/cookie-баннер |
| Правовые страницы | v1.55 | Политика, согласия |
| Hero: mesh-blobs + SVG-граф + dot-matrix | v1.66 | Радикально новый фон |
| Тематический декор hero для SEO | v1.65 | Свой набор стикеров на страницу |
| BrandMark + анимации появления | v1.61–1.62 | Унификация бренда |
| Светлая тема для SEO | v1.63 | Принудительная + lucide-иконки |
| Тарифы / Pricing | v1.63 | Новые тарифные планы |
| Demo cases (4 MVP пресета) | v1.60 | Excel-колонки + парсер-скрипт |

### 🐛 3.6. Инфраструктура

| Фича | Версия | Описание |
|------|--------|----------|
| Playwright + Chromium-headless-shell | v1.26 | Headless парсинг в Docker |
| pgvector | v1.3 | Векторный поиск для embeddings |
| Sentry | v1.49.2 | Мониторинг ошибок |
| SQLAdmin auth | v1.49.2 | Аутентификация для админки |
| Semantic-release | v1.0 | Conventional Commits + авто-changelog |
| GHCR + Docker Compose prod | v1.0–1.3 | CI/CD pipeline |
| Coolify deployment | v1.0 | Self-hosted runner |

---

## 4. База данных

**Актуальная ревизия Alembic: 032**

### Модели (40+ классов)

| Модуль | Модели |
|--------|--------|
| **Auth** | User, SocialAccount |
| **Multi-tenancy** | Organization, OrganizationRole |
| **Search** | Search, SearchResult, SearchResultPage |
| **Providers** | SearchProviderConfig |
| **Maps** | Company, CompanySource, CompanyContact, Review, MapSearch, MapSearchResult, MapSearchCache |
| **AI** | AiAssistant, PainTag, ReviewPainTag, CompanyPainScore, CompanyAiAnalysis |
| **Enrichment** | CompanyLegal, CompanyDecisionMaker |
| **Email** | EmailConfig, EmailCampaign, EmailTemplate, EmailDomain, EmailLog, EmailReply |
| **Leads** | LeadList, LeadListItem, CompanyOutreachDraft |
| **Filters** | Filter, BlacklistDomain, UserFilterPreset |
| **Admin** | Deployment |
| **Other** | CaptchaBypassConfig |

### Миграции: 001 → 032

```
001 users
002 organizations + multi-tenancy
003 nullable org_id in searches
004 search_provider_config
005 ai_assistant
006 captcha_bypass_config
008 deployments
009 social_accounts
010 email tables
011 reply_to_fields
012 email_replies
013 email_config
014 search_result_pages
015 companies, reviews, map_searches, cache
016 pain_tags, review_pain_tags, company_pain_scores
017 seed reviews_ai assistants
018 MVP contacts, quotes, lead_lists
019 map_search_radius_mode
020 user_filter_presets
021 user_preset_hidden
022 ai_prompt_in_presets
023 company_outreach_drafts
024 companies_lead_temperature
025 companies_website_lead_score
026 companies_ai_description
027 company_legal
028 company_sources
029 backfill_email_blocklist
030 backfill_yandex_city
031 company_legal_director
032 company_decision_makers
```

---

## 5. Известные проблемы

### Существовали в апреле — статус

| Проблема | Апрель | Сейчас | Комментарий |
|----------|--------|--------|-------------|
| Дашборд долго грузится | 🟡 | 🟡 | Добавлен poll-based рендеринг, но проблема остаётся |
| SEO/Leads выглядят неинтересно | 🟡 | ✅ | Redesign v2 Phase C решил |
| Мобильная версия требует доработки | 🟡 | ✅ | Адаптивная вёрстка сделана |
| Rate limiting не активен | 🟡 | 🟡 | `slowapi` есть, в prod не включён |

### Текущие (июль 2026)

1. **🟡 Дашборд медленный** — загрузка данных, требуется оптимизация запросов
2. **🟡 Rate limiting не включён** — `slowapi` установлен, но prod не защищён
3. **🟡 Deploy workflow в CI падает** — есть ручной путь через Coolify Terminal
4. **🟡 Сборка фронта на VPS** — OOM на 3.8GB RAM, только локальный build + scp
5. **🟡 Модуль тендеров** — заложен, не достроен, на паузе
6. **🟡 Self-service биллинг** — код тарифов есть, оплата не интегрирована
7. **🟡 Onboarding** — новый пользователь не знает с чего начать
8. **🟡 Demo-аккаунт** — нет read-only песочницы без регистрации

### Недавно закрыто (2026-07-05, ветка `fix/security-and-maps-providers`)

- ✅ **Безопасность `/maps/admin/*`**: 9 admin-endpoints переведены на `require_superuser` (раньше любой залогиненный юзер мог запустить тяжёлые Celery-задачи).
- ✅ **Бизнес-know-how закрыт авторизацией**: `/maps/insights/niches`, `/maps/insights/demand-index`, `/maps/pain-tags` больше не публичные.
- ✅ **`/outreach/templates`**: реализован backend CRUD (модель `UserOutreachTemplate` + миграция 043). Раньше фронт стучался в несуществующий роут и работал через localStorage-фолбэк — шаблоны не синхронизировались. См. `docs/audit-2026-07-03.md` §6.
- ✅ **maps-providers**: YandexMapsProvider интегрирован с БД-настройками; «Провайдеры карт» теперь в Sidebar всех модулей (Leads/Tenders/SEO).

### Недавно добавлено (2026-07-05, ветка `feature/cost-tracking-api-log`)

- ✅ **Cost tracking MVP**: система учёта внешних API-вызовов в таблице `api_call_log` (миграция 044). Каждый вызов 2GIS/SerpAPI/DaData/OpenAI/Anthropic/embeddings/email логируется с расчётом стоимости в рублях. Раньше `monitor` был mock; теперь отдаёт реальные данные. См. `docs/guides/COST_TRACKING.md`.
- Эндпоинты: `GET /monitor/requests` (последние вызовы), `/monitor/summary` (агрегат за период с breakdown по провайдерам), `/monitor/by-search/{id}` (стоимость конкретного поиска лидов).

### Недавно добавлено (2026-07-05, ветка `feature/email-providers-fallback`)

- ✅ **3 email-провайдера с fallback**: Yandex Cloud Postbox (основной), Amazon SES (резервный), Hyvor Relay (собственный сервер) в таблице `email_provider_config` (миграция 045). При сбое основного — авто-переход на следующий. Цена за письмо per-provider задаётся в UI и учитывается в `api_call_log`.
- UI: `/app/settings/email-providers` — 3 карточки с приоритетами, тестом подключения и полем стоимости. См. `docs/guides/EMAIL_PROVIDERS.md`.

### Что сознательно отложено

- Госзакупки (отдельный продукт)
- OAuth VK и Telegram (B2B не логинятся так)
- WhatsApp-рассылки (Meta заблокирован в РФ)
- AI Voice Agent (через 6–12 мес)
- Deep dashboards (reputation monitoring, rank tracker)

---

## 6. Сводка: план vs реальность

### Реализовано по плану ✅
- Редизайн навигации и мобильная вёрстка
- Полный редизайн UI (v2 Phase A/B/C)
- Email-рассылки (кампании, IMAP, шаблоны)
- SQLAdmin + аутентификация
- Landing page с тарифами
- Sentry мониторинг
- Правовые страницы + cookie-баннер
- Система версионирования (semantic-release)
- OAuth (фреймворк готов)

### Добавилось в процессе 🆕
- **Модуль Maps** — главная фича 2026 (парсер 2GIS + Яндекс.Карт)
- **AI-анализ болей** — sentiment + embeddings + кластеризация отзывов
- **Multi-source склейка** — 2GIS + Яндекс компании
- **ЛПР (ЛПР из DaData + LLM со страниц сайта)**
- **Тепловые карты ниш** — 5 слоёв
- **Multi-city × Multi-niche поиск**
- **SSE live-progress парсинга**
- **Bulk CSV экспорт**
- **Playwright для Яндекс.Карт**
- **6 SEO-лендингов** + sitemap/robots
- **Hero mesh-blobs + SVG граф**
- **Demo cases (4 пресета)**
- **Скоринг лидов** (temperature + website-lead)

### Не сделано ❌
- Rate limiting (prod)
- Self-service биллинг (ЮKassa/CloudPayments)
- Модуль госзакупок (заложен, на паузе)
- Реальные OAuth credentials (код готов)
- Onboarding за 60 секунд
- Demo-аккаунт без регистрации
- Telegram/WhatsApp рассылки (сознательно)

---

## 7. Примечания

- После добавления pip-зависимостей (например `aiosmtplib`) нужна **пересборка** образа backend: `docker compose build backend`
- Локальный `npm run dev`: прокси Next.js бьёт в `http://127.0.0.1:8001` (см. `frontend/app/api/v1/[...path]/route.ts`)
- Тесты backend: `pytest.ini` — `asyncio_default_fixture_loop_scope=session`
- Прод: VPS 88.210.53.183 → nginx → Traefik → Coolify → spinlid.ru
- Фронт собирается только локально (OOM на VPS): `docker build` → `docker save | scp | docker load`

---

## 8. URL

| Ресурс | URL |
|--------|-----|
| Frontend (local) | http://localhost:4000 |
| Backend API (local) | http://localhost:8001 |
| API Docs (Swagger) | http://localhost:8001/api/docs |
| SQLAdmin | http://localhost:8001/admin |
| Прод | https://spinlid.ru |
