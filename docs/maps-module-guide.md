# Maps module — developer guide

**Дата:** 2026-05-22
**Версия:** 1.0 (post-feature/maps-full, до мержа в main)

Модуль `maps` — режим «поиск лидов по картам» в Colaba. Добавляет в /app/leads
вкладку «По картам», парсер 2GIS/Я.Карт, AI-классификацию болей клиентов
из отзывов, прогрессивную выдачу через SSE и CSV-экспорт.

Этот документ — для разработчика, который пришёл к коду «после факта»:
структура, точки входа, как добавить новый источник, что настроить в env,
известные ограничения.

См. также:
- [docs/maps_parser_tz_full.md](maps_parser_tz_full.md) — исходное ТЗ
- [docs/maps-audit-2026-05.md](maps-audit-2026-05.md) — аудит проекта до начала
- [docs/maps-ai-pipeline.md](maps-ai-pipeline.md) — детально про AI-часть
- [docs/maps-final-qa-2026-05.md](maps-final-qa-2026-05.md) — финальный QA-отчёт

---

## 1. Архитектура

```
┌──────────────────────────────────────────────────────────────────────────┐
│  /app/leads (Next.js)                                                    │
│  ┌──────────────┬──────────────────────────────────────────────────────┐ │
│  │ Tabs         │  По сайтам  │  По картам                              │ │
│  │              │  (legacy)    │  MapsSearchPanel → Form → Results       │ │
│  └──────────────┴──────────────────────────────────────────────────────┘ │
└────┬──────────────────────────────────────────────────────────────────────┘
     │ axios через /api/v1/* (Next.js proxy)
     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  FastAPI backend (port 8001 → 8000 в контейнере)                          │
│  /api/v1/maps/*  router → service → models                                │
│                       │                                                    │
│                       ├─→ Celery (queue=maps/maps_reviews/maps_ai)         │
│                       │      parse_map_search → parse_company_reviews      │
│                       │      → analyze_reviews_for_company (sentiment/embed/match)
│                       │                                                    │
│                       ├─→ Redis pub/sub (channel = maps_stream:{search_id})│
│                       │      ←─ публикуют service/tasks                    │
│                       │      ←─ читает SSE-эндпоинт                        │
│                       │                                                    │
│                       └─→ PostgreSQL + pgvector                            │
│                              companies, reviews(embedding 1536),           │
│                              map_searches, map_search_cache,               │
│                              map_search_results,                           │
│                              pain_tags(centroid 1536), review_pain_tags,   │
│                              company_pain_scores                           │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Структура файлов

### Бэкенд

```
backend/
├── alembic/versions/
│   ├── 015_maps_module.py          # companies, reviews, map_searches, cache
│   └── 016_pain_tags.py            # AI-таблицы
│
├── app/models/
│   ├── maps.py                     # Company, Review, MapSearch, MapSearchCache, MapSearchResult
│   └── pain_tag.py                 # PainTag, ReviewPainTag, CompanyPainScore
│
├── app/modules/maps/
│   ├── __init__.py
│   ├── utils.py                    # mask_author, hash_review_text, derive_sentiment_from_rating
│   ├── schemas.py                  # CompanyRaw, ReviewRaw, MapSearchFilter, *Out, *Create
│   ├── filters.py                  # apply_filters(query, filter) → Select
│   ├── service.py                  # check_cache, save_*_batch, update_company_aggregates, publish_progress_event
│   ├── tasks.py                    # parse_map_search, parse_company_reviews, purge_review_raw_text
│   ├── sse.py                      # iter_search_events (генератор SSE-сообщений)
│   ├── router.py                   # /api/v1/maps/* endpoints
│   └── providers/
│       ├── base.py                 # MapProvider ABC + исключения
│       ├── twogis.py               # TwoGisProvider (Catalog API)
│       └── yandex_maps.py          # YandexMapsProvider (HTML/AJAX + bypass капчи)
│
├── app/modules/reviews_ai/
│   ├── __init__.py
│   ├── clustering.py               # HDBSCAN + центроиды
│   ├── prompts.py                  # SENTIMENT_PROMPT, CLUSTER_NAMING_PROMPT
│   ├── llm.py                      # pick_assistant_id, call_llm_*, embed_texts (OpenAI)
│   ├── service.py                  # compute_sentiment/embeddings, match_reviews_to_pain_tags, recluster_pains_for_niche
│   └── tasks.py                    # analyze_reviews_for_company, recluster_pains_for_niche_task, recluster_popular_niches
│
├── app/admin/views/maps.py         # SQLAdmin views: Company, Review, MapSearch, MapSearchCache, PainTag
├── app/core/redis_pubsub.py        # publish_event, subscribe_events, maps_stream_channel
└── tests/
    ├── maps/                       # 72 теста: utils, providers, service, filters, tasks, router, sse
    └── reviews_ai/                 # 20 тестов: clustering, llm, service, tasks
```

### Фронтенд

```
frontend/
├── app/app/leads/
│   ├── page.tsx                    # Tabs «По сайтам / По картам»
│   └── _components/
│       └── LegacyLeadsPanel.tsx    # старый /app/leads, перенесён без изменений
│
├── components/maps/
│   ├── MapsSearchPanel.tsx         # state-машина idle | searching | results
│   ├── MapsSearchForm.tsx          # niche + city + sources (2GIS/Я.Карты)
│   ├── MapsSearchResults.tsx       # grid: filters | live list, drawer
│   ├── MapsFiltersPanel.tsx        # пресеты + фильтры + облако тегов
│   ├── PainTagsCloud.tsx           # multi-select pill-бейджи AI-тегов
│   ├── MapsCompanyCard.tsx         # карточка с рейтингом/метриками/pain-tags
│   ├── MapsCompanyDetailDrawer.tsx # Dialog с табами Все/Негатив/Позитив
│   └── useSearchStream.ts          # EventSource-хук для live-прогресса
│
└── src/services/api/maps.ts        # axios-клиент, типы CompanyOut/MapSearchOut/...
```

---

## 3. Жизненный цикл поиска

1. **UI**: `MapsSearchForm` → `createMapSearch({niche, city, sources, filters})` →
   `POST /api/v1/maps/search` (`@limiter.limit("10/minute")`).
2. **Backend**: `service.create_map_search`:
   - Проверяет кэш (`map_search_cache`): для каждого source в payload. Если
     **все** свежие — status='from_cache', Celery не запускаем.
   - Иначе — status='pending'. Router ставит `parse_map_search.delay(search.id)`.
3. **Celery** `parse_map_search` (queue=maps):
   - status='running', started_at=NOW.
   - Для каждого source: `provider.search_companies` стримом → батчи по 20 →
     `save_companies_batch` → публикация `company`-события в Redis →
     `parse_company_reviews.delay(company_id, source)`.
   - После всех sources: `upsert_cache_entry`. status='completed', finished_at=NOW.
4. **Celery** `parse_company_reviews` (queue=maps_reviews):
   - `provider.fetch_reviews` → батчи по 20 → `save_reviews_batch` (дедуп по text_hash).
   - `update_company_aggregates` (counts по sentiment, owner replies, last_review_at).
   - Если есть отзывы → ставим `analyze_reviews_for_company.delay(company_id)`.
5. **Celery** `analyze_reviews_for_company` (queue=maps_ai):
   - `process_reviews_pipeline`: sentiment (LLM) → embeddings (OpenAI) →
     match с pain_tags той же ниши → ai_processed_at=NOW.
6. **SSE**: фронт через `useSearchStream` слушает `/api/v1/maps/search/{id}/stream`.
   Bootstrap из БД + live из Redis pub/sub + heartbeat 15с.

---

## 4. Как добавить новый провайдер карт

1. Создать `backend/app/modules/maps/providers/<name>.py`. Наследоваться от
   `MapProvider` (см. `base.py`):
   ```python
   class MyProvider(MapProvider):
       source_name = "mysource"
       async def search_companies(self, niche, city, limit=100) -> AsyncIterator[CompanyRaw]: ...
       async def fetch_reviews(self, company_external_id, limit=100) -> AsyncIterator[ReviewRaw]: ...
   ```
2. Добавить в `Literal` тип `Source` в `schemas.py` (там же CompanyRaw.source).
3. Зарегистрировать в `tasks.py:PROVIDERS_REGISTRY`.
4. Если новый провайдер ходит через прокси / нуждается в API-ключе — добавить
   в `Settings` (`backend/app/core/config.py`) переменные + пробросить в
   `docker-compose.yml` `environment:` для backend / celery-worker / celery-beat.
5. Покрыть mock-тестами в `backend/tests/maps/test_providers_<name>.py`.

---

## 5. Конфигурация (env)

В `.env` (или `docker-compose.yml environment:`):

```bash
# Maps
TWOGIS_API_KEY=<from dev.2gis.com>          # без него 2GIS-провайдер бросает MissingAPIKeyError
TWOGIS_RATE_LIMIT_DELAY=1.1                 # секунд между запросами
YANDEX_MAPS_RATE_LIMIT_DELAY=3.5
MAPS_CACHE_TTL_DAYS=14
MAPS_MAX_COMPANIES_PER_SEARCH=200
MAPS_MAX_REVIEWS_PER_COMPANY=100

# Reviews AI
OPENAI_API_KEY=<for embeddings>             # без него pipeline gracefully отключается
REVIEWS_AI_EMBEDDING_PROVIDER=openai
REVIEWS_AI_EMBEDDING_MODEL=text-embedding-3-small  # → VECTOR(1536) в БД
REVIEWS_AI_SENTIMENT_ASSISTANT_NAME=        # пусто = auto-pick anthropic+haiku
REVIEWS_AI_NAMING_ASSISTANT_NAME=           # пусто = auto-pick anthropic+sonnet
REVIEWS_AI_PAIN_MATCH_THRESHOLD=0.78        # cosine similarity threshold
REVIEWS_AI_MIN_CLUSTER_SIZE=8               # HDBSCAN min_cluster_size

# Proxy (для Я.Карт)
USE_PROXY=false                             # true → PROXY_URL / PROXY_LIST используется
PROXY_URL=
PROXY_LIST=
```

`OPENAI_API_KEY` и LLM-ассистенты не обязательны. Без них:
- sentiment у отзывов derived from rating (1-2 → negative, 3 → neutral, 4-5 → positive)
- embedding остаётся NULL → pain_tags не создаются
- UI показывает «AI-теги ещё не созданы для этой ниши»

---

## 6. SQLAdmin

`/admin` после логина суперюзером — пять новых разделов:
- Компании
- Отзывы
- Поиски (карты)
- Кэш карт
- Боли (теги)

Все с поиском, сортировкой, page_size 50-100.

---

## 7. Известные ограничения

### 7.1. Реальный 2GIS API недоступен на dev-машине автора

С российских провайдеров с включённым VPN до `catalog.api.2gis.com:443` TCP
проходит, но TLS handshake виснет (вероятно, SNI-фильтрация 2GIS). Smoke-вызов
с реального ключа = `httpx.ConnectTimeout`. На сервере с РФ-IP должно работать.

Код провайдера покрыт 10 mock-тестами на достоверных JSON-ответах (фикстуры
получены из публичной документации 2GIS).

### 7.2. Яндекс.Карты без прокси не работают

Без настроенного `PROXY_LIST` Я.Карты ставят капчу через 2-3 запроса. `solve_yandex_smartcaptcha`
требует ещё и сконфигурированный 2captcha (в `captcha_bypass_config`).

Для прод-парсинга Я.Карт минимум нужен:
- `USE_PROXY=true` + `PROXY_LIST=<comma-separated>` (HTTP или SOCKS5)
- В captcha bypass: `2captcha.api_key` + `enabled=true`

### 7.3. SSE через Next.js proxy буферизует

Текущий `frontend/app/api/v1/[...path]/route.ts` собирает upstream-ответ в
буфер перед отдачей. Это значит `EventSource` получит **все** события одним
пакетом в момент закрытия стрима на бэке, а не по одному.

Чтобы получить «настоящий» live: переписать прокси на streaming (`http.request`
→ `ReadableStream` → `Response(stream)`). Это правка единственного файла,
безопасная для остальных эндпоинтов. До этого UI всё равно работает корректно
(финальные карточки приходят), просто без «настоящей» live-индикации.

### 7.4. Alembic в локальной БД был на ревизии `'007'` (отсутствующий ID)

Чинится одной командой:
```sql
UPDATE alembic_version SET version_num='014';
```
При деплое `feature/maps-full` на сервер — проверить, не висит ли там та же
проблема. Если висит — выполнить ту же команду до `alembic upgrade head`.
См. `docs/maps-audit-2026-05.md` §C.

### 7.5. pgvector требует специальный образ Postgres

В compose стоит `pgvector/pgvector:pg16`. Если на сервере был стандартный
`postgres:16-alpine` — сменить образ (volume переподключается, данные
сохраняются). До смены `CREATE EXTENSION vector` упадёт.

### 7.6. hdbscan несовместим с numpy 2.x

В `requirements.txt` стоит `hdbscan>=0.8.43` именно потому, что 0.8.40 ломается
на современной scikit-learn (исчез аргумент `force_all_finite`).

---

## 8. Smoke-тест локально

```bash
# 1. Все контейнеры
docker compose up -d

# 2. Миграции
docker exec leadgen-backend alembic upgrade head
# должно показать "Running upgrade ... -> 016"

# 3. Тесты модуля
docker exec leadgen-backend bash -c "cd /app && PYTHONPATH=/app pytest tests/maps/ tests/reviews_ai/ -v"
# 92 passed

# 4. Endpoints в Swagger
curl http://localhost:8001/api/docs
# 12 endpoints под /maps/

# 5. SQLAdmin (нужен суперюзер)
open http://localhost:8001/admin
# разделы Компании / Отзывы / Поиски карт / Кэш карт / Боли

# 6. Frontend
open http://localhost:4000/app/leads
# → залогиниться → вкладка «По картам»
```
