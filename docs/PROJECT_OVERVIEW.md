# Colaba — обзор проекта

Документ для онбординга нового агента/разработчика. Один источник правды о том,
что такое Colaba, для кого делается, как устроен код и куда смотреть в первую очередь.

## Что это и для кого

**Colaba (бренд spinlid.ru)** — B2B leadgen-платформа для России. Помогает SMB-бизнесу
находить компании-клиентов (через 2GIS / Я.Карты / Google) и сразу видеть их «боли»
из публичных отзывов — чтобы холодное письмо/звонок попало в реальную проблему лида.

- **Целевой пользователь** — SEO-агентство, веб-студия, тендерщик, отдел продаж B2B-сервиса.
- **Сценарий** — выбрал нишу + город → получил список компаний с метриками
  (рейтинг, негатив, активность владельца, top-боли клиентов) → отфильтровал на тех,
  кому действительно «жмёт» → выгрузил CSV или сразу сгенерировал cold-email-драфт.
- **Команда** — solo-фаундер (Дима). Бюджет на разработку — 0, оплачивает только инфру.

Главная стратегическая ставка: «один поиск — три сигнала под холодное письмо»
(контакт + повод + аргумент), всё остальное на этапе MVP — bonus.

## Стек

| Слой | Технология |
|---|---|
| Frontend | Next.js 14 App Router · React 18 · TailwindCSS · Zustand · React Query · Leaflet (карта) |
| Backend | FastAPI · SQLAlchemy 2 (async) · Alembic · Pydantic v2 |
| БД | PostgreSQL 16 + pgvector (embeddings отзывов) |
| Queue/cache | Redis · Celery (6 воркеров) |
| AI | OpenAI text-embedding-3-small + GPT-4 mini через **ProxyAPI** (РФ-шлюз). Кластеризация — HDBSCAN. |
| Прод | VPS spinlid.ru · Coolify · GitHub Actions auto-deploy через self-hosted runner |
| Auth | JWT + OAuth (Google/Yandex/VK/Telegram — реализованы, активны не все) |
| Платежи | Заложено под ЮKassa/CloudPayments, **не подключено** |
| Парсинг | 2GIS API (ключ есть) · Я.Карты SSR-HTML парсер · Google через SerpAPI (в работе) |
| Анти-капча | 2captcha + anticaptcha + Yandex SmartCaptcha + AI Vision |

## Структура репозитория

```
backend/
  app/
    main.py                   # FastAPI entry, монтаж роутеров
    core/                     # config, database, dependencies, rate_limit, security
    models/                   # SQLAlchemy модели (organization, company, review, pain_tag, …)
    modules/
      auth/                   # JWT + OAuth
      maps/                   # ⭐ ОСНОВНОЙ модуль — поиск компаний, фильтры, экспорт
        providers/twogis.py   # 2GIS
        providers/yandex.py   # Я.Карты SSR
        providers/google.py   # SerpAPI
        router.py             # все эндпоинты /maps/*
        service.py            # бизнес-логика
        tasks.py              # Celery задачи (парсинг)
      reviews_ai/             # ⭐ AI-пайплайн отзывов → pain_tags
      outreach/               # cold-email + DraftEmailModal на фронте
      providers/              # search-провайдеры (DDG/Yandex/Google web search)
      payments/               # ЮKassa/CloudPayments (skeleton)
      tenders/                # госзакупки (skeleton)
      organizations/          # multi-tenancy
      user_presets/           # сохранённые AI-пресеты и фильтры
      ai_assistants/          # настройки LLM
      filters/                # переиспользуемые фильтры
      lead_lists/             # «Мои списки»
      dashboard/              # сводные метрики
      monitor/                # health, провайдеры
      email/                  # mail config (DB-backed)
      captcha/                # bypass конфиг
      deployments/            # деплоймент-логи
      searches/               # web search jobs
  alembic/versions/           # миграции (последняя 028 — multi-source)
  tests/                      # pytest (maps, reviews_ai, auth, …)
  requirements.txt
  Dockerfile

frontend/
  app/                        # App Router pages
    insights/demand-index/    # §4 ТЗ 2026-06-10 — индекс спроса по нишам
    maps/                     # главный экран
    ...
  components/
    maps/
      MapsSearchPanel.tsx
      MapsSearchResults.tsx           # ⭐ список компаний + шапка топ-болей
      MapsCompanyDetailDrawer.tsx     # ⭐ карточка компании (drawer)
      MapsCompanyCard.tsx
      MapsCompaniesMap.tsx            # Leaflet heatmap
      MapsFiltersPanel.tsx
      CompanyDigestBlock.tsx          # 30-дневный дайджест в drawer
      PainBenchmarkBlock.tsx          # сравнение с нишей
      NegativeTrendBadge.tsx          # rising/falling
      OutreachDraftBlock.tsx
      DraftEmailModal.tsx
  src/services/api/maps.ts            # все REST-клиенты к /maps/*
  src/services/api/reviews-ai.ts
  package.json
  next.config.js

docs/
  PROJECT_OVERVIEW.md          # этот файл
  maps-module-guide.md
  maps-ai-pipeline.md
  Plan_2026-05-03.md
  email-replies-setup.md
  ROADMAP.md
  STATUS.md
```

## Ключевые модели данных

- `Organization` — tenant (multi-tenancy).
- `MapSearch` — один запрос «ниша + город + источник». Привязан к user_id.
- `MapSearchCache` — TTL-кэш результатов (один раз спарсили — N дней живём).
- `Company` — компания (id, name, address, niche, city, lat, lng, rating, website…).
- `CompanySource` — профиль компании в конкретном источнике (2GIS / Я.Карты),
  с источниковыми контактами и метриками.
- `Review` — отзыв (source, posted_at, sentiment, rating, embedding[1536], raw_text).
- `PainTag` — авто-кластер болей `(niche, city, label, centroid, occurrences_count)`.
- `ReviewPainTag` — M:N связь review → pain_tag (cosine similarity).
- `CompanyPainScore` — денормализация `(company_id, pain_tag_id, mention_count, top_quote)`.
- `UserPreset` — сохранённый фильтр + AI-пресет на форме поиска.
- `LeadList` — «Мои списки» (закладки).

## AI-пайплайн (reviews_ai)

1. `analyze_reviews_for_company` — для каждого отзыва: embedding + sentiment (LLM).
2. `recluster_pains_for_niche` — Celery-задача:
   - берём `Review` ниши+города, **где** `sentiment IN ('negative','neutral') OR rating<=3`
     (positive исключаем — иначе кластеры «качество X» захламляют pain-облако),
   - HDBSCAN кластеризация по embedding,
   - для каждого кластера: LLM-naming (короткий конкретный лейбл боли),
   - upsert в `pain_tags`, расставляем `review_pain_tags` + `company_pain_scores`.
3. Прогресс отслеживается через `/maps/companies/{id}/ai-progress`.

ProxyAPI URL и ключ — в `.env` (`PROXYAPI_KEY`, `OPENAI_BASE_URL`).

## Основные API-эндпоинты `/maps/*`

| Метод | Путь | Зачем |
|---|---|---|
| POST | `/maps/search` | Создать поиск (ниша+город+источник), ставит Celery |
| GET | `/maps/search/{id}` | Состояние поиска |
| GET | `/maps/search/{id}/companies` | Список компаний с фильтрами |
| GET | `/maps/companies/{id}` | Карточка компании (контакты, метрики, pain_tags) |
| GET | `/maps/companies/{id}/reviews` | Отзывы с фильтром (sentiment, source, pain_tag) |
| GET | `/maps/companies/{id}/pain-benchmark` | Сравнение с нишей |
| GET | `/maps/companies/{id}/negative-trend` | Тренд негатива (rising/falling) |
| GET | `/maps/pain-tags?niche&city&source&from&to` | Топ-боли региона с пересчётом по источнику/периоду |
| GET | `/maps/insights/pain-trend` | Динамика боли по месяцам, group by source |
| GET | `/maps/insights/demand-index` | §4 — индекс спроса по нишам |
| GET | `/maps/insights/niches` | Список ниш с counts |
| GET | `/maps/heatmap` | Heatmap (6 слоёв: density/pain/website/rating/wealth/pain_type) |
| GET | `/maps/health/providers` | Статусы провайдеров (2GIS/Я/DaData/LLM/Sentry) |

## Деплой и окружения

- **Локально**: docker-compose (Postgres+Redis+backend+frontend+celery).
- **Прод**: VPS `88.210.53.183`, домен `spinlid.ru`, Coolify-панель + GitHub Actions.
  GHA получает push на main → собирает образы → self-hosted runner на VPS
  делает `compose pull && compose up -d` + `alembic upgrade head`.
- **Релизы**: semantic-release создаёт коммит `chore(release): X.Y.Z [skip ci]`
  и тег `vX.Y.Z`. Версия сейчас 1.73+.

## Что работает и что в очереди (на 2026-06-11)

**Работает на проде:**
- Парсинг 2GIS и Я.Карт, кэш, экспорт CSV.
- AI-пайплайн: embeddings + sentiment + кластеризация + pain-теги.
- Шапка «Топ-боли региона» в выдаче, кликабельная — фильтрует список.
- Drawer карточки: контакты по источникам, DaData юр.данные, ЛПР, динамика боли,
  benchmark vs ниша, тренд негатива.
- §4 demand-index страница.
- Heatmap (6 слоёв).
- Cold-email драфт через LLM.
- Onboarding с сохранением пресета.

**В ближайших PR:**
- Toggle источника/периода в шапке топ-болей + inline chart (ветка `feat/pain-summary-source-period`).
- Поднять «Сравнение с нишей» из drawer в шапку выдачи (новый PR).
- Подключить Google как третий источник (ветка `feat/google-maps-provider`).

**Стратегические дыры (план 2026-05-03):**
- Self-service биллинг (ЮKassa).
- Доменная инфра для cold email (SPF/DKIM/DMARC + warm-up).
- Demo-аккаунт / песочница.
- 2–3 публичных кейса.
- Sentry на бэк.

## Как этим пользоваться агенту/разработчику

- **Изменения в maps-выдаче** → `frontend/components/maps/MapsSearchResults.tsx` +
  `backend/app/modules/maps/router.py`.
- **Изменения в карточке компании** → `MapsCompanyDetailDrawer.tsx`.
- **Новый AI-сигнал по отзывам** → `backend/app/modules/reviews_ai/` + UI блок в drawer.
- **Новый endpoint** → `router.py` + `schemas.py` + клиент в
  `frontend/src/services/api/maps.ts`.
- **Миграция** → `alembic revision -m "..."` + правка в `models/`.

Все ветки идут через PR в `main`, после merge — авто-деплой. Локально билдить
frontend на VPS нельзя (OOM) — только локально или через GHA.
