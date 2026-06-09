# ТЗ: Модуль maps для Colaba — полный скоуп

> **Версия:** 2.0 (max scope)
> **Дата:** 21 мая 2026
> **Исполнитель:** Claude Code (автономно)
> **Базовая ветка:** `main` (уточнить в шаге 0.4.1)
> **Рабочая ветка:** `feature/maps-full`

---

## 0. Контекст и принципы работы

### 0.1. Что мы строим

Полная фича «поиск лидов по картам» с AI-классификацией болей клиентов из отзывов:

1. **Парсер карт** (2GIS + Яндекс.Карты) — компании + отзывы
2. **AI-пайплайн** — sentiment, embeddings, кластеризация болей, теги болей
3. **Прогрессивная выдача через SSE** — карточки появляются по мере парсинга
4. **Новый UI** — переключатель режимов, фильтры по болям + рейтингу + отзывам, облако тегов, экспорт

Это **главная фишка продукта** — компании с диагнозом, поводы написать, а не плоский список контактов.

### 0.2. Что мы НЕ делаем в этой итерации

- **Визуал НЕ осовремениваем** — используем существующие UI-компоненты проекта (shadcn/ui или что там стоит) как есть. Никаких новых дизайн-токенов, никаких редизайнов карточек.
- Генерация писем с перифразом болей через LLM — это следующая итерация (промпт и логика готовы в PDF-плане, но в код не идут сейчас).
- Биллинг / квоты / enforcement лимитов — отдельное ТЗ.
- Google Maps как источник.
- Изменения в модуле `searches/` — он работает в режиме «по сайтам», его НЕ ТРОГАЕМ.
- Изменения в outreach / email — переиспользуем как есть, если понадобится.
- Закрытие SQLAdmin авторизацией — отдельная задача (но если в проекте `AdminAuth` уже написан, просто не подключён — это можно сделать одной строкой в этом ТЗ как бонус).

### 0.3. Принципы исполнения

**Никакой потери существующего функционала.** Все текущие модули, эндпоинты, страницы продолжают работать. Новый модуль `maps/` живёт параллельно `searches/`. Юзер выбирает режим на странице `/app/leads` через переключатель.

**Атомарные коммиты.** Каждая логическая часть = отдельный коммит. После каждого — проект должен запускаться без ошибок. Conventional Commits: `feat(maps): ...`, `feat(maps-ai): ...`, `feat(maps-ui): ...`, `fix(maps): ...`, `chore(maps): ...`, `test(maps): ...`, `docs(maps): ...`.

**История изменений.** В `CHANGELOG.md` (создать если нет, формат Keep a Changelog) — обновлять после каждого крупного этапа.

**Тесты вместе с кодом, не отдельным этапом.** Минимум — happy path + 1-2 edge case на каждый блок. Фикстуры — реальные ответы 2GIS / Я.Карт, обрезанные.

**После каждого этапа — обязательная проверка:**
1. `docker compose up -d` или `make up`
2. `docker compose exec backend alembic upgrade head`
3. `docker compose exec backend pytest backend/tests/maps/ -v`
4. `curl http://localhost:8000/docs` — Swagger жив, новые эндпоинты видны
5. Старый flow поиска по сайтам всё ещё работает (открыть `/app/leads`, выполнить поиск в режиме «по сайтам»)

### 0.4. Что Claude Code делает на старте, ДО написания кода

#### Шаг 0.4.1 — Аудит существующей кодовой базы

Создать `docs/maps-audit-2026-05.md` с разделами:

**A. Структура и стек**
- Версия Python, FastAPI, SQLAlchemy (1.x sync / 2.x async — критично!)
- ORM-стиль (`Mapped[T]` или классический `Column(...)`)
- Стиль миграций (autogenerate работает корректно? или пишем вручную?)
- HTTP-клиент (httpx? aiohttp?)
- Структура Settings (pydantic-settings v1/v2)
- Стиль логгера (structlog? loguru? std logging?)
- Frontend стек: Next.js версия, UI-библиотека (shadcn/ui, Mantine, что-то другое), система стилей (Tailwind?)

**B. Существующие модули**
- `searches/` — выписать структуру (router, models, service, tasks, schemas)
- `captcha/` — какие функции в `solver.py`, какая сигнатура у `solve_yandex_smartcaptcha(html, url)`?
- `captcha/common.py` — как именно работает с прокси (`PROXY_LIST` или `PROXY_URL`)?
- `ai_assistants/` — какие модели есть, как вызывать LLM (`chat()`, какие провайдеры)?
- `core/celery_app.py` — текущие очереди, beat schedule
- `auth/` — `get_current_user` зависимость

**C. Текущая Alembic ревизия**
- `alembic current` — записать
- Ожидаемая `014`. Если другая → отметить и адаптировать имена миграций.

**D. SQLAdmin**
- Где регистрируется (`backend/app/admin/main.py`?)
- Есть ли `AdminAuth` в `backend/app/admin/auth.py`?
- Открыт без авторизации или нет?

**E. Frontend**
- `frontend/app/app/leads/page.tsx` — какие компоненты используются, есть ли `CityCombobox`, `FilterBuilder`, `NICHE_PRESETS`, `EmptyState`?
- Есть ли в проекте свой клиент к бэку (axios / fetch wrapper)?
- Куда складывать API-функции (`frontend/lib/`?)?

**F. Доступ к LLM**
- Какие провайдеры активны в `ai_assistants/` (по env или БД)?
- У кого вероятно есть рабочий ключ — Anthropic / OpenAI / Yandex?
- Поддерживается ли batch-API?

**G. Векторный поиск**
- Установлен ли `pgvector` extension в текущей БД? Проверить `SELECT * FROM pg_extension WHERE extname='vector';`
- Если нет — план: создать через миграцию `CREATE EXTENSION IF NOT EXISTS vector;`

**H. Известные проблемы при запуске**
- При попытке `docker compose up -d` всё поднялось? Какие сервисы есть?
- Кто слушает на каких портах?

**Без аудита дальнейшие шаги не начинать.** После аудита — `git add docs/ && git commit -m "docs(maps): аудит существующей кодовой базы"`.

#### Шаг 0.4.2 — Локальный запуск

```
docker compose up -d
```

Дождаться: postgres, redis, backend, celery worker, celery beat, frontend.

Проверки:
- `curl http://localhost:8000/docs` — открывается
- `curl http://localhost:3000` — фронт жив
- `curl http://localhost:8000/admin` — SQLAdmin открывается

Если что-то не запускается — **остановиться, зафиксировать в аудит-доке, спросить пользователя**.

### 0.5. Защита от поломок

Перед каждым крупным этапом — smoke-тест:
1. Открыть `/app/leads`, выполнить старый поиск в режиме «по сайтам» — работает?
2. `pytest backend/tests/ -v` (все тесты) — ничего не сломалось?

Если что-то сломалось — откат, разбор, фикс.

### 0.6. Что Claude Code обязан спросить (а не «додумать»)

- Alembic revision не 014 → спросить, какой номер
- SQLAlchemy sync вместо async → как делать в новом модуле
- LLM-провайдеры — какой использовать для sentiment (Haiku/Yandex) и какой для naming кластеров (Sonnet/Haiku/Yandex)?
- Если в проекте уже есть `Drawer`/`Slider` — реюзать или делать с нуля?
- Если в `searches/router.py` SSE/EventSource всё-таки есть — заюзать существующее?
- Если pgvector не установлен на dev-БД и нет прав на `CREATE EXTENSION` — что делать?

**Правило: один уточняющий вопрос лучше часа rework.**

---

## 1. Архитектура модулей

### 1.1. Три новых модуля

```
backend/app/modules/
├── maps/                          ← парсер карт
│   ├── __init__.py
│   ├── router.py
│   ├── models.py                  (Company, Review, MapSearch, MapSearchCache, MapSearchResult)
│   ├── schemas.py
│   ├── service.py
│   ├── tasks.py                   (parse_map_search, parse_company_reviews, purge_review_raw_text)
│   ├── filters.py
│   ├── sse.py                     (SSE streaming endpoint logic)
│   ├── providers/
│   │   ├── __init__.py
│   │   ├── base.py
│   │   ├── twogis.py
│   │   └── yandex_maps.py
│   └── utils.py
│
├── reviews_ai/                    ← AI-обработка отзывов
│   ├── __init__.py
│   ├── models.py                  (PainTag, ReviewPainTag, CompanyPainScore)
│   ├── schemas.py
│   ├── service.py                 (sentiment, embeddings, clustering, naming)
│   ├── tasks.py                   (analyze_reviews_batch, recluster_pains_for_niche)
│   ├── clustering.py              (HDBSCAN + центроиды)
│   ├── prompts.py                 (промпты для LLM-naming кластеров)
│   └── llm.py                     (обёртка над ai_assistants/client для batch)
│
└── (общая инфра — Redis pub/sub для SSE)
    backend/app/core/redis_pubsub.py   (общая утилита для публикации событий)
```

### 1.2. Новые Celery очереди

```python
# в backend/app/core/celery_app.py — ДОБАВИТЬ
task_queues = (
    Queue('celery'),
    Queue('search_queue'),
    # NEW:
    Queue('maps'),
    Queue('maps_reviews'),
    Queue('maps_ai'),       # для analyze_reviews_batch и recluster
    Queue('maintenance'),
)

beat_schedule = {
    # ... existing ...
    'purge-review-raw-text': {
        'task': 'purge_review_raw_text',
        'schedule': crontab(hour=3, minute=30),  # ежедневно
    },
    'recluster-popular-niches': {
        'task': 'recluster_popular_niches',
        'schedule': crontab(hour=4, minute=0),   # ежедневно после purge
    },
}
```

### 1.3. Конвенции

- Эндпоинты: `/api/v1/maps/*`
- Префиксы коммитов: `feat(maps)`, `feat(maps-ai)`, `feat(maps-ui)`, `feat(maps-sse)`
- Pydantic суффиксы: `Out`, `Create`, `Filter` — следовать стилю `searches/schemas.py`
- Логи: тег `module=maps` / `module=maps_ai`

---

## 2. Миграции БД

### 2.1. Миграция 015 — companies + reviews + cache + searches

**Файл:** `backend/alembic/versions/015_maps_module.py`

```sql
-- extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;  -- pgvector для embeddings

-- companies
CREATE TABLE companies (
  id BIGSERIAL PRIMARY KEY,
  organization_id INT REFERENCES organizations(id) ON DELETE SET NULL,
  source VARCHAR(20) NOT NULL,
  external_id VARCHAR(255) NOT NULL,
  name VARCHAR(500) NOT NULL,
  niche VARCHAR(100),
  city VARCHAR(100),
  address VARCHAR(500),
  lat NUMERIC(9,6),
  lng NUMERIC(9,6),
  phone VARCHAR(50),
  website VARCHAR(500),
  rating NUMERIC(3,2),
  reviews_count INT DEFAULT 0,
  reviews_positive_count INT DEFAULT 0,
  reviews_negative_count INT DEFAULT 0,
  reviews_neutral_count INT DEFAULT 0,
  has_owner_replies BOOLEAN DEFAULT FALSE,
  owner_replies_count INT DEFAULT 0,
  rating_history JSONB,           -- [{date, rating}, ...] для динамики
  last_review_at TIMESTAMPTZ,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (source, external_id)
);
CREATE INDEX ix_companies_niche_city ON companies(niche, city);
CREATE INDEX ix_companies_rating ON companies(rating);
CREATE INDEX ix_companies_organization_id ON companies(organization_id);
CREATE INDEX ix_companies_name_trgm ON companies USING gin (name gin_trgm_ops);

-- reviews
CREATE TABLE reviews (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source VARCHAR(20) NOT NULL,
  external_id VARCHAR(255),
  author_masked VARCHAR(50),
  rating SMALLINT,
  raw_text TEXT,
  raw_text_purged_at TIMESTAMPTZ,
  sentiment VARCHAR(10),
  sentiment_score NUMERIC(3,2),
  source_url VARCHAR(500),
  posted_at TIMESTAMPTZ,
  has_owner_reply BOOLEAN DEFAULT FALSE,
  text_hash VARCHAR(64),
  embedding VECTOR(1536),         -- OpenAI text-embedding-3-small / Yandex embedding
  ai_processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ix_reviews_company_posted ON reviews(company_id, posted_at DESC);
CREATE INDEX ix_reviews_sentiment ON reviews(sentiment) WHERE sentiment IS NOT NULL;
CREATE UNIQUE INDEX ux_reviews_company_text_hash ON reviews(company_id, text_hash);
CREATE INDEX ix_reviews_embedding ON reviews USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
CREATE INDEX ix_reviews_unprocessed ON reviews(id) WHERE ai_processed_at IS NULL;

-- map_search_cache
CREATE TABLE map_search_cache (
  id SERIAL PRIMARY KEY,
  niche VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  source VARCHAR(20) NOT NULL,
  companies_count INT DEFAULT 0,
  reviews_count INT DEFAULT 0,
  parsed_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (niche, city, source)
);
CREATE INDEX ix_map_search_cache_expires ON map_search_cache(expires_at);

-- map_searches
CREATE TABLE map_searches (
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id INT REFERENCES organizations(id) ON DELETE SET NULL,
  niche VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  sources VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL,
  filters JSONB,
  companies_found INT DEFAULT 0,
  reviews_found INT DEFAULT 0,
  ai_progress VARCHAR(20) DEFAULT 'pending',  -- pending|running|done|skipped
  error TEXT,
  error_type VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
CREATE INDEX ix_map_searches_user_id ON map_searches(user_id);
CREATE INDEX ix_map_searches_status ON map_searches(status);
CREATE INDEX ix_map_searches_created_at ON map_searches(created_at DESC);

-- map_search_results
CREATE TABLE map_search_results (
  map_search_id BIGINT REFERENCES map_searches(id) ON DELETE CASCADE,
  company_id BIGINT REFERENCES companies(id) ON DELETE CASCADE,
  position INT,
  PRIMARY KEY (map_search_id, company_id)
);
CREATE INDEX ix_map_search_results_search_id ON map_search_results(map_search_id);
```

### 2.2. Миграция 016 — pain_tags + AI таблицы

**Файл:** `backend/alembic/versions/016_pain_tags.py`

```sql
-- pain_tags — автоматически создаваемые теги болей по нише+городу
CREATE TABLE pain_tags (
  id SERIAL PRIMARY KEY,
  niche VARCHAR(100) NOT NULL,
  city VARCHAR(100),                  -- NULL = глобальный для ниши
  label VARCHAR(200) NOT NULL,        -- 'долгое ожидание записи'
  description TEXT,                   -- LLM-описание группы
  centroid VECTOR(1536),              -- центроид кластера, для матчинга новых отзывов
  occurrences_count INT DEFAULT 0,
  cluster_size INT,                   -- размер кластера на момент создания
  examples JSONB,                     -- 3-5 sample отзывов (text_hash + сокращённый текст 100 символов)
  status VARCHAR(20) DEFAULT 'active', -- 'active' | 'archived'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (niche, city, label)
);
CREATE INDEX ix_pain_tags_niche ON pain_tags(niche, city);
CREATE INDEX ix_pain_tags_status ON pain_tags(status);

-- review_pain_tags — M:N
CREATE TABLE review_pain_tags (
  review_id BIGINT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  pain_tag_id INT NOT NULL REFERENCES pain_tags(id) ON DELETE CASCADE,
  similarity NUMERIC(4,3),
  PRIMARY KEY (review_id, pain_tag_id)
);
CREATE INDEX ix_review_pain_tags_tag ON review_pain_tags(pain_tag_id);

-- company_pain_scores — денормализация для фильтрации
CREATE TABLE company_pain_scores (
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pain_tag_id INT NOT NULL REFERENCES pain_tags(id) ON DELETE CASCADE,
  mention_count INT NOT NULL DEFAULT 0,
  first_mention_at TIMESTAMPTZ,
  last_mention_at TIMESTAMPTZ,
  PRIMARY KEY (company_id, pain_tag_id)
);
CREATE INDEX ix_company_pain_scores_tag ON company_pain_scores(pain_tag_id, mention_count DESC);
CREATE INDEX ix_company_pain_scores_company ON company_pain_scores(company_id);
```

### 2.3. Downgrade

Для обоих миграций — корректный `downgrade`, который удаляет таблицы в обратном порядке (FK constraints). Extensions НЕ удаляем.

### 2.4. Применение

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend alembic current
```

**Коммиты:**
1. `feat(maps): миграция 015 — companies, reviews, map_searches, кэш`
2. `feat(maps-ai): миграция 016 — pain_tags, review_pain_tags, company_pain_scores`

---

## 3. Провайдеры карт

### 3.1. Базовый интерфейс

`backend/app/modules/maps/providers/base.py`:

```python
from abc import ABC, abstractmethod
from typing import AsyncIterator
from app.modules.maps.schemas import CompanyRaw, ReviewRaw

class MapProvider(ABC):
    source_name: str
    @abstractmethod
    async def search_companies(self, niche: str, city: str, limit: int = 100) -> AsyncIterator[CompanyRaw]: ...
    @abstractmethod
    async def fetch_reviews(self, company_external_id: str, limit: int = 100) -> AsyncIterator[ReviewRaw]: ...

class MissingAPIKeyError(Exception): pass
class CaptchaWallError(Exception): pass
class RateLimitError(Exception): pass
```

### 3.2. Провайдер 2GIS

`backend/app/modules/maps/providers/twogis.py`

**Endpoint base:** `https://catalog.api.2gis.com`

**API-ключ:** `TWOGIS_API_KEY` из env. Если пусто — `MissingAPIKeyError`.

**Endpoints:**
- Поиск: `GET /3.0/items?q={niche}&region_id={region_id}&key={key}&fields=items.point,items.contact_groups,items.reviews,items.rubrics&page_size=50`
- Карточка: `GET /2.0/items/byid?id={item_id}&key={key}&fields=items.point,items.reviews,items.contact_groups`
- Отзывы: `GET /2.0/reviews/list?object_id={item_id}&object_type=branch&key={key}&limit=50&offset=0`

**CITY_TO_REGION_ID dict:**
```python
CITY_TO_REGION_ID = {
    "москва": 1, "санкт-петербург": 2, "новосибирск": 12, "екатеринбург": 54,
    "казань": 21, "нижний новгород": 18, "челябинск": 56, "красноярск": 14,
    "самара": 33, "уфа": 41, "ростов-на-дону": 38, "омск": 66,
    "краснодар": 23, "воронеж": 64, "пермь": 31, "волгоград": 39,
    "ижевск": 44, "иркутск": 13, "тюмень": 45, "хабаровск": 28,
    "владивосток": 4, "томск": 15, "оренбург": 35, "кемерово": 53,
    "рязань": 50, "тула": 49, "пенза": 36, "липецк": 32,
}
```

Если города нет в маппинге — fallback на `region_id=70000001` (Россия) + фильтр по адресу через ILIKE на стороне БД.

**Маппинг 2GIS item → CompanyRaw:**

| 2GIS | CompanyRaw |
|---|---|
| `id` | `external_id` |
| `name` | `name` |
| `address_name` | `address` |
| `point.lat`, `point.lon` | `lat`, `lng` |
| `contact_groups[*].contacts[type=phone].value[0]` | `phone` |
| `contact_groups[*].contacts[type=website].value[0]` | `website` |
| `reviews.general_rating` | `rating` |
| `reviews.general_review_count` | `reviews_count` |

**Маппинг 2GIS review → ReviewRaw:**

| 2GIS | ReviewRaw |
|---|---|
| `id` | `external_id` |
| `user.name` → `mask_author()` | `author_masked` |
| `rating` | `rating` |
| `text` | `raw_text` |
| `url` | `source_url` |
| `date_created` | `posted_at` |
| `is_reply_by_owner` | `has_owner_reply` |

**Rate limiting:** `TWOGIS_RATE_LIMIT_DELAY=1.1` сек между запросами. При 429 → backoff 30 сек, retry 3 раза. При 401/403 → `MissingAPIKeyError`. При 5xx → backoff 5 сек, retry 3.

**Прокси НЕ используем для 2GIS — прямой IP.**

### 3.3. Провайдер Яндекс.Карт

`backend/app/modules/maps/providers/yandex_maps.py`

**URL:** `https://yandex.ru/maps/?text={query}&display-text={niche}`

**Стратегия:**
1. Загрузить HTML страницу выдачи через прокси (`PROXY_LIST` из `captcha/common.py`).
2. Найти JSON-LD блок `<script type="application/ld+json">` — парсить organizations.
3. Если JSON-LD пуст или некачественный → fallback AJAX `https://yandex.ru/maps/api/search/?text={q}&type=business&lang=ru&results=50`.
4. Карточка: `https://yandex.ru/maps/org/{slug}/{org_id}/` — оттуда отзывы.
5. Отзывы: `https://yandex.ru/maps/api/business/fetchReviews?businessId={org_id}&offset=0&limit=50`.

**Обход капчи:**
- Маркер: `<div class="CheckboxCaptcha"` в HTML или редирект на `https://yandex.ru/showcaptcha`.
- Вызвать `app.modules.captcha.solver.solve_yandex_smartcaptcha(html, url)` (узнать точную сигнатуру в шаге 0.4.1).
- Подставить токен → cookies → ретрай.
- 3 капчи подряд → `CaptchaWallError` → search.status = `failed`.

**Прокси:** обязательно через `PROXY_LIST` или функцию из `captcha/common.py`. Ротация на каждый запрос. После капчи — сменить прокси.

**Rate limiting:** `YANDEX_MAPS_RATE_LIMIT_DELAY=3.5` сек + рандом ±1 сек. На каждый отдельный прокси — не чаще раз в 5 сек.

**User-Agent ротация:** список из 5-7 свежих UA (Chrome 121+, Firefox 122+, Safari 17+). Хардкодим в файле.

**Маппинг JSON-LD → CompanyRaw:**
```python
{
    "external_id": extract_id_from_url(ld["@id"]),  # 'yandex.ru/maps/org/123' → '123'
    "name": ld["name"],
    "address": ld["address"]["streetAddress"],
    "phone": ld.get("telephone"),
    "website": ld.get("url"),
    "rating": float(ld["aggregateRating"]["ratingValue"]) if ld.get("aggregateRating") else None,
    "reviews_count": int(ld["aggregateRating"]["reviewCount"]) if ld.get("aggregateRating") else 0,
    "lat": ld["geo"]["latitude"] if ld.get("geo") else None,
    "lng": ld["geo"]["longitude"] if ld.get("geo") else None,
}
```

**Маппинг fetchReviews API → ReviewRaw:**
```python
{
    "external_id": item["id"],
    "author_masked": mask_author(item["author"]["name"]),
    "rating": item["rating"],
    "raw_text": item["text"],
    "source_url": item.get("link"),
    "posted_at": datetime.fromtimestamp(item["time"]),
    "has_owner_reply": bool(item.get("business_reply")),
}
```

### 3.4. Утилиты

`backend/app/modules/maps/utils.py`:

```python
import hashlib, re
from datetime import datetime

def mask_author(full_name: str | None) -> str:
    if not full_name or not full_name.strip():
        return "Аноним"
    parts = full_name.strip().split()
    return ". ".join(p[0].upper() for p in parts[:2]) + "."

def normalize_text_for_hash(text: str | None) -> str:
    if not text:
        return ""
    text = text.lower()
    text = re.sub(r'\s+', ' ', text).strip()
    text = re.sub(r'[^\w\s]', '', text)
    return text

def hash_review_text(text: str | None) -> str:
    return hashlib.sha256(normalize_text_for_hash(text).encode()).hexdigest()

def derive_sentiment_from_rating(rating: int | None) -> tuple[str, float]:
    """Fallback sentiment (используется до LLM-обработки).
    Возвращает (label, score 0-1)."""
    if rating is None:
        return "neutral", 0.5
    if rating <= 2:
        return "negative", 1.0 - (rating - 1) * 0.25
    if rating == 3:
        return "neutral", 0.5
    return "positive", (rating - 3) * 0.5
```

### 3.5. Тесты

`backend/tests/maps/test_providers_twogis.py`:
- `test_search_companies_happy_path` (мок httpx + фикстура)
- `test_search_companies_pagination`
- `test_search_companies_rate_limit_retry`
- `test_search_companies_missing_key`
- `test_fetch_reviews_pagination`
- `test_city_not_in_map_uses_fallback_region`

`backend/tests/maps/test_providers_yandex.py`:
- `test_parse_jsonld_happy_path`
- `test_detect_captcha_marker`
- `test_captcha_wall_three_attempts`
- `test_proxy_rotation`
- `test_fetch_reviews_via_ajax`

Фикстуры в `backend/tests/maps/fixtures/`:
- `twogis_search_response.json` (реальный обрезанный ответ)
- `twogis_reviews_response.json`
- `yandex_search_jsonld.html`
- `yandex_captcha_wall.html`
- `yandex_fetch_reviews_response.json`

**Коммиты:**
1. `feat(maps): базовый интерфейс MapProvider и общие схемы`
2. `feat(maps): провайдер 2GIS — Catalog API`
3. `feat(maps): провайдер Яндекс.Карт — JSON-LD + AJAX + bypass SmartCaptcha`
4. `test(maps): тесты провайдеров + фикстуры`

---

## 4. Сервис maps и Celery-задачи

### 4.1. service.py

```python
async def create_map_search(db, user_id, niche, city, sources, filters=None) -> MapSearch:
    """Создаёт MapSearch, проверяет кэш, запускает Celery.
    Если кэш свежий по всем sources → status='from_cache', задача НЕ ставится,
    результаты сразу собираются из existing companies через map_search_results."""

async def check_cache(db, niche, city, source, ttl_days=14) -> bool: ...

async def save_companies_batch(db, companies_raw, search_id) -> list[Company]:
    """UPSERT по (source, external_id). Привязывает к map_search через map_search_results."""

async def save_reviews_batch(db, company_id, reviews_raw) -> int:
    """Дедуп по (company_id, text_hash). Заполняет sentiment через derive_sentiment_from_rating().
    embedding и ai_processed_at остаются NULL — заполнит analyze_reviews_batch."""

async def update_company_aggregates(db, company_id) -> None:
    """Пересчёт reviews_*_count, has_owner_replies, owner_replies_count, last_review_at."""

async def get_search_results(db, search_id, filters, limit, offset) -> tuple[list[Company], int]:
    """С применением фильтров через filters.apply_filters()."""

async def publish_progress_event(search_id, event_type, payload) -> None:
    """Публикует в Redis pub/sub канал maps_stream:{search_id}.
    event_type: 'company' | 'progress' | 'done' | 'error'"""
```

### 4.2. filters.py

```python
def apply_filters(query, filters: MapSearchFilter):
    """Накладывает фильтры на SQLAlchemy query к Company.
    Параметры:
    - min_rating, max_rating: NUMERIC(3,2)
    - min_reviews: int
    - min_negative: int (reviews_negative_count)
    - has_owner_replies: bool | None
    - pain_tag_ids: list[int] | None (через JOIN company_pain_scores)
    - min_pain_mentions: int (минимум mention_count по любому из pain_tag_ids)
    - sort_by: 'rating_asc' | 'rating_desc' | 'reviews_desc' | 'negative_desc' | 'pain_desc'
    """
    if filters.min_rating is not None:
        query = query.filter(Company.rating >= filters.min_rating)
    if filters.max_rating is not None:
        query = query.filter(Company.rating <= filters.max_rating)
    if filters.min_reviews is not None:
        query = query.filter(Company.reviews_count >= filters.min_reviews)
    if filters.min_negative is not None:
        query = query.filter(Company.reviews_negative_count >= filters.min_negative)
    if filters.has_owner_replies is not None:
        query = query.filter(Company.has_owner_replies == filters.has_owner_replies)
    if filters.pain_tag_ids:
        query = query.join(CompanyPainScore).filter(
            CompanyPainScore.pain_tag_id.in_(filters.pain_tag_ids),
            CompanyPainScore.mention_count >= (filters.min_pain_mentions or 1)
        )
    # сортировка
    sort_map = {
        'rating_asc': Company.rating.asc().nullslast(),
        'rating_desc': Company.rating.desc().nullslast(),
        'reviews_desc': Company.reviews_count.desc(),
        'negative_desc': Company.reviews_negative_count.desc(),
        'pain_desc': CompanyPainScore.mention_count.desc(),
    }
    return query.order_by(sort_map.get(filters.sort_by, Company.rating.desc().nullslast()))
```

### 4.3. tasks.py

```python
@celery_app.task(name="parse_map_search", queue="maps", bind=True, max_retries=2)
def parse_map_search(self, search_id: int):
    """1. Берём MapSearch, ставим status='running'.
    2. Для каждого source в search.sources:
       a. Проверяем кэш. Свежий → собираем companies из БД через JOIN с map_search_results.
       b. Иначе → провайдер.search_companies() стримит CompanyRaw.
          Сохраняем батчами по 20 через save_companies_batch().
          После каждого батча → publish_progress_event('company', {company_id, position}).
          Для каждой компании → parse_company_reviews.delay(company_id, source).
       c. После завершения source → запись в map_search_cache.
    3. Когда ВСЕ parse_company_reviews завершились (через chord или периодический check) → запуск analyze_reviews_batch на новых отзывах.
    4. После AI-обработки → publish_progress_event('done').
    5. status='completed', finished_at=NOW().
    """

@celery_app.task(name="parse_company_reviews", queue="maps_reviews", bind=True, max_retries=2)
def parse_company_reviews(self, company_id: int, source: str, limit: int = 50):
    """Тянет отзывы из source. Сохраняет батчами по 20.
    В конце update_company_aggregates(company_id) и publish_progress_event('reviews_done', {company_id})."""

@celery_app.task(name="purge_review_raw_text", queue="maintenance")
def purge_review_raw_text():
    """UPDATE reviews SET raw_text=NULL, raw_text_purged_at=NOW()
       WHERE created_at < NOW() - INTERVAL '30 days' AND raw_text IS NOT NULL.
       Логирует count."""

@celery_app.task(name="recluster_popular_niches", queue="maps_ai")
def recluster_popular_niches():
    """Раз в сутки — перекластеризует pain_tags для топ-30 (niche, city) комбинаций по объёму отзывов.
    Вызывает recluster_pains_for_niche.delay(niche, city) для каждого."""
```

### 4.4. Координация parse → AI

Простой подход: после завершения `parse_map_search` (когда все парсинги отзывов закончились) — внутри той же задачи запускаем `analyze_reviews_batch` для всех `reviews.ai_processed_at IS NULL` этого поиска.

Альтернатива (если в проекте используется): Celery `chord` — собирает результаты дочерних задач и потом запускает callback.

Решение: **не использовать chord** в первой итерации — слишком хрупко. Делаем proще: `parse_map_search` в конце:
```python
# дождаться, пока все parse_company_reviews закончатся
# (опросом БД: WHERE company_id IN (...) AND last_review_at IS NULL — пока есть, ждать)
# с таймаутом 5 минут
```

Или ещё проще — отдельный watcher-task, который смотрит unprocessed reviews и крутит analyze_reviews_batch. Это надёжнее.

**Финальная схема:**
1. `parse_map_search` тянет компании + ставит parse_company_reviews для каждой.
2. После того как parse_map_search закончил парсинг компаний → ставим status='parsed' (промежуточный).
3. parse_company_reviews для каждой компании → save_reviews_batch + публикует event → когда отзывы по компании готовы, ставит analyze_reviews_for_company.delay(company_id).
4. analyze_reviews_for_company → embeddings + sentiment + match к pain_tags → publish_progress_event('ai_done', {company_id}).
5. Когда последний company_id обработан AI → ставим status='completed', publish_progress_event('done').

Это упрощает координацию: каждая компания идёт по пайплайну независимо.

### 4.5. Тесты

`backend/tests/maps/test_service.py`:
- `test_create_map_search_uses_cache`
- `test_create_map_search_no_cache_starts_task`
- `test_save_companies_batch_upsert`
- `test_save_reviews_batch_dedup_by_text_hash`
- `test_update_company_aggregates`

`backend/tests/maps/test_filters.py`:
- `test_filter_by_rating_range`
- `test_filter_by_pain_tag`
- `test_sort_by_negative_desc`

`backend/tests/maps/test_tasks.py`:
- `test_purge_review_raw_text_only_old`

**Коммиты:**
1. `feat(maps): сервис — кэш, save_companies/reviews_batch, агрегаты`
2. `feat(maps): фильтры по рейтингу, отзывам, болям`
3. `feat(maps): Celery-задачи парсинга + cron purge`
4. `test(maps): тесты сервиса, фильтров, задач`

---

## 5. AI-пайплайн: reviews_ai

### 5.1. service.py

```python
async def compute_sentiment(db, review_ids: list[int]) -> int:
    """Batch sentiment-классификация через LLM (Claude Haiku / Yandex GPT Lite).
    Промпт см. в prompts.py: SENTIMENT_PROMPT.
    Обновляет reviews.sentiment и sentiment_score.
    Возвращает количество обработанных."""

async def compute_embeddings(db, review_ids: list[int]) -> int:
    """Batch embeddings через OpenAI text-embedding-3-small или Yandex Embeddings.
    Запросы пачками по 100 (лимит OpenAI).
    Обновляет reviews.embedding."""

async def match_reviews_to_pain_tags(db, review_ids: list[int]) -> dict[int, list[int]]:
    """Для каждого отзыва находит ближайшие pain_tags той же ниши через cosine similarity
       по centroid.
    Threshold: 0.78 (подбирается).
    Сохраняет в review_pain_tags + обновляет company_pain_scores.
    Возвращает {review_id: [pain_tag_id, ...]}."""

async def recluster_pains_for_niche(db, niche: str, city: str | None) -> int:
    """1. Берём все reviews этой ниши и города (или ВСЕ для ниши, если city=None) с embeddings.
    2. HDBSCAN(min_cluster_size=8, min_samples=4) по embeddings.
    3. Для каждого кластера:
       - центроид (mean of embeddings)
       - топ-10 sample reviews
       - LLM-naming через prompts.CLUSTER_NAMING_PROMPT → label + description
    4. UPSERT в pain_tags по (niche, city, label).
    5. Перематчинг всех reviews этой ниши → match_reviews_to_pain_tags().
    Возвращает количество созданных/обновлённых тегов."""

async def process_reviews_pipeline(db, review_ids: list[int]) -> None:
    """Полный пайплайн для пачки отзывов:
    1. compute_sentiment
    2. compute_embeddings
    3. match_reviews_to_pain_tags
    4. mark ai_processed_at = NOW()"""
```

### 5.2. clustering.py

```python
import hdbscan
import numpy as np

def cluster_embeddings(embeddings: np.ndarray, min_cluster_size: int = 8, min_samples: int = 4) -> np.ndarray:
    """Возвращает массив labels (кластер -1 = шум)."""
    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=min_cluster_size,
        min_samples=min_samples,
        metric='euclidean',
        cluster_selection_method='eom'
    )
    return clusterer.fit_predict(embeddings)

def compute_centroid(embeddings: np.ndarray) -> np.ndarray:
    """Centroid = mean of embeddings."""
    return embeddings.mean(axis=0)
```

Установить `hdbscan` в `requirements.txt`.

### 5.3. prompts.py

```python
SENTIMENT_PROMPT = """Определи тональность каждого отзыва из списка.

Верни ТОЛЬКО JSON-массив в формате:
[{"id": <review_id>, "sentiment": "positive|negative|neutral", "score": <0.0-1.0>}, ...]

score — уверенность модели в классификации.

Отзывы:
{reviews_json}
"""

CLUSTER_NAMING_PROMPT = """Тебе дано {count} отзывов клиентов о бизнесах в нише "{niche}".
Эти отзывы попали в один кластер по семантической близости.

Определи общую тему отзывов одним коротким label (2-5 слов на русском) и опиши её одним предложением.

Верни JSON:
{{
  "label": "...",
  "description": "..."
}}

Отзывы:
{reviews_sample}
"""
```

### 5.4. llm.py — обёртка над ai_assistants

```python
async def call_llm_batch_sentiment(reviews: list[dict]) -> list[dict]:
    """Использует ai_assistants.client.chat() с подходящим ассистентом.
    Промпт: SENTIMENT_PROMPT.
    Парсит JSON ответ.
    Если ассистент Claude Haiku 4.5 доступен → его, иначе Yandex GPT Lite, иначе любой дешёвый."""

async def call_llm_cluster_naming(niche: str, sample_reviews: list[str]) -> dict:
    """Промпт: CLUSTER_NAMING_PROMPT. Возвращает {label, description}.
    Использует более качественный LLM (Sonnet или Yandex GPT Pro)."""

async def call_embedding_api(texts: list[str]) -> list[list[float]]:
    """OpenAI text-embedding-3-small или Yandex Embeddings.
    Конфиг: REVIEWS_AI_EMBEDDING_PROVIDER env. Default: 'openai'.
    Возвращает list of 1536-dim vectors."""
```

**Конфиг и fallback:** в шаге 0.4.1 узнаём, какие LLM-провайдеры реально работают. Если ничего нет — пайплайн НЕ падает, но `ai_processed_at` остаётся NULL, sentiment остаётся derived from rating, pain_tags не создаются. UI должен корректно отображать «AI-анализ временно недоступен».

### 5.5. tasks.py

```python
@celery_app.task(name="analyze_reviews_for_company", queue="maps_ai", bind=True, max_retries=2)
def analyze_reviews_for_company(self, company_id: int):
    """Берёт все reviews этой компании с ai_processed_at IS NULL.
    Прогоняет process_reviews_pipeline().
    Если для этой ниши+города ещё нет pain_tags — НЕ матчит, просто заполняет sentiment+embedding.
    Pain matching произойдёт после первой recluster_pains_for_niche."""

@celery_app.task(name="analyze_reviews_batch", queue="maps_ai")
def analyze_reviews_batch(review_ids: list[int]):
    """Универсальная — для ручного запуска или периодического. Пачки по 50."""

@celery_app.task(name="recluster_pains_for_niche_task", queue="maps_ai", bind=True, time_limit=600)
def recluster_pains_for_niche_task(self, niche: str, city: str | None = None):
    """Обёртка над service.recluster_pains_for_niche()."""

@celery_app.task(name="recluster_popular_niches", queue="maps_ai")
def recluster_popular_niches():
    """Top-30 (niche, city) по объёму reviews → ставим recluster_pains_for_niche_task для каждого."""
```

### 5.6. Тесты

`backend/tests/reviews_ai/test_clustering.py`:
- `test_hdbscan_clusters_similar_texts` (мок embeddings — 3 группы по 5 одинаковых векторов + шум)
- `test_centroid_computation`

`backend/tests/reviews_ai/test_llm.py`:
- мок ai_assistants.client → проверяем что промпт правильно собран и JSON парсится
- `test_sentiment_parses_response`
- `test_cluster_naming_parses_response`

`backend/tests/reviews_ai/test_service.py`:
- `test_match_reviews_to_pain_tags_above_threshold`
- `test_match_reviews_to_pain_tags_below_threshold_no_save`
- `test_recluster_creates_new_tags_and_archives_unused`

**Коммиты:**
1. `feat(maps-ai): модели pain_tags + миграция 016`
2. `feat(maps-ai): clustering (HDBSCAN + центроиды)`
3. `feat(maps-ai): промпты + LLM-обёртка над ai_assistants`
4. `feat(maps-ai): сервис — sentiment, embeddings, match, recluster`
5. `feat(maps-ai): Celery-задачи AI-пайплайна`
6. `test(maps-ai): тесты кластеризации, LLM-обёрток, сервиса`

---

## 6. SSE — прогрессивная выдача

### 6.1. Redis pub/sub

`backend/app/core/redis_pubsub.py`:

```python
import json, redis.asyncio as aioredis
from app.core.config import settings

async def get_redis() -> aioredis.Redis:
    return aioredis.from_url(settings.REDIS_URL, decode_responses=True)

async def publish_event(channel: str, event_type: str, data: dict):
    """Публикует JSON {type, data} в Redis канал."""
    r = await get_redis()
    msg = json.dumps({"type": event_type, "data": data})
    await r.publish(channel, msg)

async def subscribe_events(channel: str):
    """Async-итератор по сообщениям канала."""
    r = await get_redis()
    pubsub = r.pubsub()
    await pubsub.subscribe(channel)
    try:
        async for msg in pubsub.listen():
            if msg["type"] == "message":
                yield json.loads(msg["data"])
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.close()
```

### 6.2. SSE endpoint

`backend/app/modules/maps/sse.py`:

```python
from fastapi import Request
from fastapi.responses import StreamingResponse
from app.core.redis_pubsub import subscribe_events

async def stream_search_events(search_id: int, db, user) -> StreamingResponse:
    """SSE для одного поиска.
    1. Проверяем что search принадлежит user (или его organization).
    2. Сначала отдаём текущее состояние из БД (companies уже найденные).
    3. Затем подписываемся на канал maps_stream:{search_id}.
    4. Стримим события клиенту.
    5. На 'done' — закрываем стрим.
    Поддерживает SSE формат:
       event: {type}
       data: {json}

       (двойной \\n в конце)
    """
    channel = f"maps_stream:{search_id}"

    async def event_gen():
        # 1. бутстрап — существующие компании
        existing = await get_existing_companies(db, search_id)
        for c in existing:
            yield f"event: company\ndata: {company_to_json(c)}\n\n"

        # 2. подписка на live
        try:
            async for event in subscribe_events(channel):
                yield f"event: {event['type']}\ndata: {json.dumps(event['data'])}\n\n"
                if event['type'] == 'done':
                    break
                # heartbeat каждые 15 сек чтобы прокси не убил соединение
        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # для nginx
            "Connection": "keep-alive",
        }
    )
```

### 6.3. Endpoint в router

```python
@router.get("/search/{search_id}/stream")
async def stream_search(
    search_id: int, request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """SSE стрим для прогрессивной выдачи."""
    # проверка владения search
    search = await get_or_404(db, MapSearch, search_id, user_id=user.id)
    return await stream_search_events(search_id, db, user)
```

### 6.4. Что публикует сервис

В `parse_map_search`, `parse_company_reviews`, `analyze_reviews_for_company` — после каждого значимого шага:

```python
await publish_event(f"maps_stream:{search_id}", "company", {
    "company_id": company.id,
    "name": company.name,
    "rating": company.rating,
    "reviews_count": company.reviews_count,
    "position": position,
})

await publish_event(f"maps_stream:{search_id}", "company_updated", {
    "company_id": company_id,
    "reviews_count": ...,
    "reviews_negative_count": ...,
    "pain_tags": [{"id": ..., "label": ...}],
})

await publish_event(f"maps_stream:{search_id}", "progress", {
    "stage": "parsing|ai",
    "companies_processed": 15,
    "companies_total": 80,
})

await publish_event(f"maps_stream:{search_id}", "done", {
    "companies_found": 80,
    "reviews_found": 1342,
    "duration_seconds": 47,
})
```

### 6.5. Тесты SSE

`backend/tests/maps/test_sse.py`:
- `test_stream_emits_existing_companies_on_connect`
- `test_stream_forwards_pubsub_events`
- `test_stream_closes_on_done_event`
- `test_stream_403_for_other_user` (404 или 403)

Тесты можно делать через TestClient FastAPI с `stream=True` ответом.

**Коммиты:**
1. `feat(maps-sse): Redis pub/sub утилита`
2. `feat(maps-sse): SSE endpoint для прогрессивной выдачи`
3. `feat(maps-sse): публикация событий в сервисе и Celery-задачах`
4. `test(maps-sse): тесты стрима`

---

## 7. API endpoints (полный список)

### 7.1. Роутер

`backend/app/modules/maps/router.py`:

```python
router = APIRouter(prefix="/api/v1/maps", tags=["maps"])

# Поиски
POST   /search                              MapSearchCreate → MapSearchOut
GET    /search/{id}                         → MapSearchOut
GET    /search/{id}/stream                  → SSE
GET    /search/{id}/companies               (фильтры в query) → CompaniesListOut
GET    /search/{id}/pain-tags               → list[PainTagOut]   (теги, которые есть в этом поиске)
POST   /search/{id}/export                  → StreamingResponse (CSV/XLSX)

# Компании
GET    /companies/{id}                      → CompanyDetailOut (+ recent_reviews + pain_tags)
GET    /companies/{id}/reviews              (фильтр sentiment) → ReviewsListOut

# Метаданные
GET    /cities                              → list[str]
GET    /niche-suggestions?q=...             → list[str]   (autocomplete)
GET    /pain-tags?niche=...&city=...        → list[PainTagOut]   (cloud для UI)
GET    /health/providers                    → {twogis: 'ok|no_api_key|rate_limited', yandex_maps: ...}
```

### 7.2. Pydantic-схемы

`backend/app/modules/maps/schemas.py`:

```python
class MapSearchCreate(BaseModel):
    niche: str = Field(..., min_length=2, max_length=100)
    city: str = Field(..., min_length=2, max_length=100)
    sources: list[Literal['2gis', 'yandex_maps']] = Field(default=['2gis'])
    filters: 'MapSearchFilter | None' = None

class MapSearchFilter(BaseModel):
    min_rating: float | None = None
    max_rating: float | None = None
    min_reviews: int | None = None
    min_negative: int | None = None
    has_owner_replies: bool | None = None
    pain_tag_ids: list[int] | None = None
    min_pain_mentions: int = 1
    sort_by: Literal['rating_asc','rating_desc','reviews_desc','negative_desc','pain_desc'] = 'rating_desc'

class CompanyOut(BaseModel):
    id: int
    name: str
    niche: str | None
    city: str | None
    address: str | None
    phone: str | None
    website: str | None
    rating: float | None
    reviews_count: int
    reviews_positive_count: int
    reviews_negative_count: int
    reviews_neutral_count: int
    has_owner_replies: bool
    owner_replies_count: int
    last_review_at: datetime | None
    source: str
    source_url: str | None
    pain_tags: list['PainTagShort'] = []
    class Config: from_attributes = True

class CompanyDetailOut(CompanyOut):
    recent_reviews: list['ReviewOut']

class ReviewOut(BaseModel):
    id: int
    author_masked: str | None
    rating: int | None
    raw_text: str | None
    sentiment: str | None
    sentiment_score: float | None
    posted_at: datetime | None
    has_owner_reply: bool
    source_url: str | None
    pain_tags: list['PainTagShort'] = []
    class Config: from_attributes = True

class PainTagOut(BaseModel):
    id: int
    niche: str
    city: str | None
    label: str
    description: str | None
    occurrences_count: int
    examples: list[dict] | None
    class Config: from_attributes = True

class PainTagShort(BaseModel):
    id: int
    label: str
    similarity: float | None = None

class MapSearchOut(BaseModel):
    id: int
    niche: str
    city: str
    sources: str
    status: str
    ai_progress: str
    companies_found: int
    reviews_found: int
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    error: str | None
    class Config: from_attributes = True

class CompaniesListOut(BaseModel):
    items: list[CompanyOut]
    total: int
    limit: int
    offset: int
```

### 7.3. Регистрация

В `backend/app/main.py` (или `api/router.py`):

```python
from app.modules.maps.router import router as maps_router
app.include_router(maps_router)
```

### 7.4. Rate-limiting

```python
@limiter.limit("10/minute") on POST /search
@limiter.limit("5/minute") on POST /search/{id}/export
@limiter.limit("60/minute") on GET endpoints
```

### 7.5. Тесты роутера

`backend/tests/maps/test_router.py`:
- `test_create_search_happy_path`
- `test_create_search_invalid_niche_422`
- `test_create_search_unauthorized_401`
- `test_get_companies_with_filters`
- `test_get_companies_filter_by_pain_tag`
- `test_get_company_detail_returns_reviews_and_pain_tags`
- `test_export_csv_with_filters`
- `test_pain_tags_list_for_niche`
- `test_health_providers_no_key`
- `test_other_user_cannot_access_search_403`

**Коммиты:**
1. `feat(maps): Pydantic-схемы для API`
2. `feat(maps): endpoints — search, companies, reviews, pain_tags, export`
3. `feat(maps): rate-limiting на эндпоинтах`
4. `test(maps): тесты эндпоинтов`

---

## 8. Frontend (без визуального осовременивания)

**Принцип:** используем существующие UI-компоненты как есть. Никаких новых дизайн-токенов, цветов, отступов. Старые компоненты переиспользуем максимально.

### 8.1. Структура

```
frontend/components/maps/
├── MapsSearchPanel.tsx
├── MapsSearchForm.tsx
├── MapsFiltersPanel.tsx
├── PainTagsCloud.tsx
├── MapsCompaniesList.tsx
├── MapsCompanyCard.tsx
├── MapsCompanyDetailDrawer.tsx
├── MapsExportButton.tsx
└── useSearchStream.ts          (хук для SSE)

frontend/lib/maps/
├── api.ts
├── types.ts
└── hooks.ts
```

### 8.2. MapsSearchPanel

Главный компонент. Управляет state:
- `mode: 'idle' | 'searching' | 'results'`
- `searchId: number | null`
- `filters: MapSearchFilter`

Поведение:
1. `idle` → показывает `MapsSearchForm`.
2. После submit → `POST /search` → получает `searchId` → `mode='searching'`.
3. Открывает SSE через `useSearchStream(searchId)` — events накапливаются.
4. По мере прихода `event: company` — добавляет в локальный список (опционально).
5. На `event: done` → `mode='results'`, делаем `GET /search/{id}/companies` с текущими фильтрами для финального списка.
6. Изменение фильтров → дебаунс 300мс → `GET /search/{id}/companies?...` → перерисовка `MapsCompaniesList`.

### 8.3. useSearchStream — SSE-хук

```ts
import { useEffect, useState } from 'react';

interface StreamState {
  companies: CompanyOut[];
  progress: { stage: string; processed: number; total: number } | null;
  done: boolean;
  error: string | null;
}

export function useSearchStream(searchId: number | null): StreamState {
  const [state, setState] = useState<StreamState>({
    companies: [], progress: null, done: false, error: null
  });

  useEffect(() => {
    if (!searchId) return;
    const es = new EventSource(`/api/v1/maps/search/${searchId}/stream`,
                                { withCredentials: true });

    es.addEventListener('company', (e) => {
      const data = JSON.parse(e.data);
      setState(s => ({ ...s, companies: [...s.companies, data] }));
    });
    es.addEventListener('company_updated', (e) => {
      const data = JSON.parse(e.data);
      setState(s => ({
        ...s,
        companies: s.companies.map(c =>
          c.id === data.company_id ? { ...c, ...data } : c
        )
      }));
    });
    es.addEventListener('progress', (e) => {
      setState(s => ({ ...s, progress: JSON.parse(e.data) }));
    });
    es.addEventListener('done', () => {
      setState(s => ({ ...s, done: true }));
      es.close();
    });
    es.addEventListener('error', (e: any) => {
      setState(s => ({ ...s, error: e.data || 'connection error' }));
      es.close();
    });

    return () => es.close();
  }, [searchId]);

  return state;
}
```

### 8.4. MapsFiltersPanel

Использует существующие компоненты UI-библиотеки (`Slider`, `Switch`, `Select`, `Button`). Никаких новых компонентов.

Контролы:
- Слайдер «Рейтинг» — range (min/max)
- Number input «Минимум отзывов»
- Number input «Негативных отзывов от»
- Switch «Только без ответов владельца»
- Select «Сортировка»
- **Облако тегов болей** (`PainTagsCloud`) — отдельный компонент, см. ниже
- 3 кнопки-пресета: «Кризис репутации», «Падение рейтинга», «Стабильный»

### 8.5. PainTagsCloud

```tsx
function PainTagsCloud({ niche, city, value, onChange }: {
  niche: string;
  city: string;
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const { data: tags } = useQuery(['pain-tags', niche, city],
    () => getPainTags(niche, city));

  return (
    <div className="flex flex-wrap gap-2">
      {tags?.map(tag => (
        <Badge
          key={tag.id}
          variant={value.includes(tag.id) ? 'default' : 'outline'}
          onClick={() => onChange(toggleId(value, tag.id))}
          className="cursor-pointer"
        >
          {tag.label} · {tag.occurrences_count}
        </Badge>
      ))}
      {!tags?.length && <p className="text-sm text-muted-foreground">
        AI-теги ещё не созданы для этой ниши. Они появятся после первого поиска.
      </p>}
    </div>
  );
}
```

### 8.6. MapsCompanyCard

Минимальная карточка, использующая существующие `Card` и `Badge` компоненты:
- Название
- Адрес
- Метрики в ряд: рейтинг + бейдж, кол-во отзывов, негативных, owner replies
- Бейджи pain_tags (если есть)
- Источник
- Клик → открывает `MapsCompanyDetailDrawer`

### 8.7. MapsCompanyDetailDrawer

Использует существующий `Drawer` (или `Sheet` из shadcn). Если нет — `Dialog`.

Содержит:
- Шапка: name, address, phone, website, ссылка «Открыть оригинал» на source_url
- Метрики
- Теги болей с tooltip = description тега
- Tabs «Все / Негатив / Позитив»
- Список отзывов с `ReviewCard`:
  - `author_masked`, дата, ★ рейтинг, текст
  - Если raw_text=null → плашка «Текст удалён по политике хранения. Открыть оригинал»
  - Бейджи pain_tags на каждом отзыве
  - Бейдж «есть ответ владельца»

### 8.8. Переключатель режимов на /app/leads

В `frontend/app/app/leads/page.tsx` — **минимальное вмешательство**:

```tsx
'use client';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import LegacyLeadsPanel from './_components/LegacyLeadsPanel'; // вынести существующий код
import { MapsSearchPanel } from '@/components/maps/MapsSearchPanel';

export default function LeadsPage() {
  const [mode, setMode] = useState<'sites' | 'maps'>('sites');
  return (
    <div>
      <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
        <TabsList>
          <TabsTrigger value="sites">По сайтам</TabsTrigger>
          <TabsTrigger value="maps">По картам</TabsTrigger>
        </TabsList>
        <TabsContent value="sites"><LegacyLeadsPanel /></TabsContent>
        <TabsContent value="maps"><MapsSearchPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
```

Существующий код `page.tsx` рефакторим в `_components/LegacyLeadsPanel.tsx` **без изменений логики**, только перенос.

### 8.9. API-клиент

`frontend/lib/maps/api.ts`:

```ts
export async function createMapSearch(payload: MapSearchCreate): Promise<MapSearchOut>
export async function getMapSearch(id: number): Promise<MapSearchOut>
export async function listMapCompanies(searchId: number, filters: MapSearchFilter, limit, offset): Promise<CompaniesListOut>
export async function getCompanyDetail(id: number): Promise<CompanyDetailOut>
export async function getCompanyReviews(id: number, sentiment?, limit?, offset?): Promise<ReviewsListOut>
export async function getPainTags(niche: string, city?: string): Promise<PainTagOut[]>
export async function getCitySuggestions(q: string): Promise<string[]>
export async function exportSearch(searchId: number, format: 'csv'|'xlsx', filters: MapSearchFilter): Promise<Blob>
```

Использовать существующий http-клиент проекта (axios или fetch wrapper — узнать в шаге 0.4.1).

### 8.10. Тесты фронта

Если есть Vitest/Jest:
- `MapsSearchForm.test.tsx` — submit пустой ниши не отправляется
- `useSearchStream.test.tsx` — EventSource mock, проверяем что events накапливаются
- `MapsFiltersPanel.test.tsx` — клик по пресету «Кризис репутации» выставляет правильные значения

Если фронт-тестов нет — не настраивать.

**Коммиты:**
1. `feat(maps-ui): API-клиент и TS-типы`
2. `feat(maps-ui): переключатель режимов на /app/leads + вынос LegacyLeadsPanel`
3. `feat(maps-ui): MapsSearchForm`
4. `feat(maps-ui): useSearchStream — SSE-хук`
5. `feat(maps-ui): MapsFiltersPanel + PainTagsCloud + 3 пресета`
6. `feat(maps-ui): MapsCompaniesList + MapsCompanyCard`
7. `feat(maps-ui): MapsCompanyDetailDrawer с отзывами и тегами`
8. `feat(maps-ui): MapsExportButton`

---

## 9. SQLAdmin views

`backend/app/admin/maps_views.py`:

```python
from sqladmin import ModelView
from app.modules.maps.models import Company, Review, MapSearch, MapSearchCache
from app.modules.reviews_ai.models import PainTag

class CompanyAdmin(ModelView, model=Company):
    name = "Компания"; name_plural = "Компании"
    column_list = [Company.id, Company.name, Company.niche, Company.city,
                   Company.rating, Company.reviews_count,
                   Company.reviews_negative_count, Company.source, Company.created_at]
    column_searchable_list = [Company.name, Company.phone, Company.website]
    column_sortable_list = [Company.rating, Company.reviews_count, Company.created_at]
    column_default_sort = ("created_at", True)
    page_size = 50

class ReviewAdmin(ModelView, model=Review):
    name = "Отзыв"; name_plural = "Отзывы"
    column_list = [Review.id, Review.company_id, Review.author_masked, Review.rating,
                   Review.sentiment, Review.has_owner_reply, Review.posted_at,
                   Review.raw_text_purged_at, Review.ai_processed_at]
    column_default_sort = ("posted_at", True)
    page_size = 100

class MapSearchAdmin(ModelView, model=MapSearch):
    name = "Поиск (карты)"; name_plural = "Поиски (карты)"
    column_list = [MapSearch.id, MapSearch.user_id, MapSearch.niche, MapSearch.city,
                   MapSearch.sources, MapSearch.status, MapSearch.ai_progress,
                   MapSearch.companies_found, MapSearch.created_at]
    column_default_sort = ("created_at", True)

class PainTagAdmin(ModelView, model=PainTag):
    name = "Боль (тег)"; name_plural = "Боли (теги)"
    column_list = [PainTag.id, PainTag.niche, PainTag.city, PainTag.label,
                   PainTag.occurrences_count, PainTag.status, PainTag.updated_at]
    column_sortable_list = [PainTag.occurrences_count, PainTag.updated_at]
    column_searchable_list = [PainTag.label, PainTag.niche]
    column_default_sort = ("occurrences_count", True)

class MapSearchCacheAdmin(ModelView, model=MapSearchCache):
    name = "Кэш карт"; name_plural = "Кэш карт"
    column_list = [MapSearchCache.niche, MapSearchCache.city, MapSearchCache.source,
                   MapSearchCache.companies_count, MapSearchCache.parsed_at,
                   MapSearchCache.expires_at]
```

Зарегистрировать через `admin.add_view(...)` в основном init.

**Бонус (если успеется):** в шаге 0.4.1 проверить, подключён ли `AdminAuth` в SQLAdmin. Если в проекте файл `AdminAuth` есть, но не передан в `Admin(...)` — подключить одной строкой `Admin(app, engine, authentication_backend=AdminAuth(secret_key=settings.SECRET_KEY))`. Это закроет дыру одной строкой.

**Коммит:** `feat(maps-admin): SQLAdmin views — companies, reviews, searches, pain_tags, cache`

---

## 10. Конфигурация .env

В `.env.example`:

```bash
# === Maps module ===
TWOGIS_API_KEY=                          # dev.2gis.com, free 1000 req/day
MAPS_CACHE_TTL_DAYS=14
MAPS_MAX_COMPANIES_PER_SEARCH=200
MAPS_MAX_REVIEWS_PER_COMPANY=100
TWOGIS_RATE_LIMIT_DELAY=1.1
YANDEX_MAPS_RATE_LIMIT_DELAY=3.5

# === Reviews AI ===
REVIEWS_AI_EMBEDDING_PROVIDER=openai     # 'openai' | 'yandex'
REVIEWS_AI_EMBEDDING_MODEL=text-embedding-3-small
REVIEWS_AI_SENTIMENT_ASSISTANT_NAME=     # имя ai_assistant из БД, оставить пустым = auto-pick
REVIEWS_AI_NAMING_ASSISTANT_NAME=        # имя ai_assistant для именования кластеров
REVIEWS_AI_PAIN_MATCH_THRESHOLD=0.78
REVIEWS_AI_MIN_CLUSTER_SIZE=8

# === SSE ===
SSE_HEARTBEAT_INTERVAL=15                # секунд
```

В коде через `Settings` (pydantic-settings, тот же класс что в проекте — **дополнить**, не создавать новый).

**Коммит:** `chore(maps): env переменные для maps + reviews_ai`

---

## 11. Документация

### 11.1. CHANGELOG.md (корень)

Создать если нет, формат Keep a Changelog:

```markdown
# Changelog

## [Unreleased]

### Added
- **Модуль maps** — поиск лидов через 2GIS и Я.Карты с отзывами и AI-классификацией болей.
  - Таблицы: companies, reviews, map_searches, map_search_cache, map_search_results.
  - Provider 2GIS (Catalog API, free 1000 req/день).
  - Provider Я.Карты (HTML/AJAX, обход SmartCaptcha через captcha/solver).
  - SSE-стрим для прогрессивной выдачи `/api/v1/maps/search/{id}/stream`.
- **Модуль reviews_ai** — AI-обработка отзывов.
  - Таблицы: pain_tags, review_pain_tags, company_pain_scores.
  - Sentiment + embeddings + HDBSCAN-кластеризация.
  - LLM-naming кластеров через ai_assistants.
  - pgvector для семантического поиска.
- UI: переключатель «по сайтам / по картам» на /app/leads, фильтры, облако тегов, экспорт.
- SQLAdmin views для модерации компаний, отзывов, поисков, тегов.
- Cron purge_review_raw_text (TTL 30 дней для raw_text).
- Cron recluster_popular_niches (ежедневная переcclusterизация топ-30 ниш).

### Changed
- /app/leads теперь поддерживает 2 режима. Старый «по сайтам» оставлен без изменений.

### Notes
- Биллинг / квоты на поиски — отдельная задача, не входит в эту итерацию.
- Генерация cold-писем с перифразом — следующая итерация.
- Визуальный осовременивание (редизайн карточек, типографики) — следующая итерация.
```

После каждого крупного этапа дополнять `[Unreleased]`.

### 11.2. docs/maps-module-guide.md

Developer guide по новым модулям — как добавить новый провайдер, как кэш работает, какие LLM используются, как настроить TWOGIS_API_KEY, известные ограничения.

### 11.3. docs/maps-ai-pipeline.md

Отдельный документ про AI-пайплайн:
- Жизненный цикл отзыва: parse → sentiment → embedding → match → pain_tag
- Когда срабатывает recluster, как работает HDBSCAN
- Промпты (sentiment + naming) полным текстом
- Threshold для match (0.78, как настраивать)
- Cost-оценка: ~0.001₽ за отзыв на sentiment, ~0.0005₽ на embedding, ~0.5₽ на наименование кластера

### 11.4. Inline docstrings

Все публичные функции `service.py`, `tasks.py`, `providers/*.py`, `clustering.py`, `llm.py` — docstrings.

**Коммиты:**
1. `docs(maps): CHANGELOG.md`
2. `docs(maps): developer guide и AI-pipeline doc`

---

## 12. Финальный QA-чеклист

После всех этапов — выполнить и зафиксировать в `docs/maps-final-qa-2026-05.md`:

### 12.1. Бэкенд

- [ ] `docker compose up -d` — все сервисы поднимаются
- [ ] `alembic upgrade head` — обе миграции (015, 016) применяются на чистой БД
- [ ] `alembic downgrade -2` — откат тоже работает
- [ ] `pgvector` extension активна (`SELECT * FROM pg_extension WHERE extname='vector';`)
- [ ] `pytest backend/tests/maps/ -v` — все тесты зелёные
- [ ] `pytest backend/tests/reviews_ai/ -v` — все тесты зелёные
- [ ] `pytest backend/tests/ -v` — НЕ сломалось ничего из существующего
- [ ] Swagger `/docs` показывает новые эндпоинты `/api/v1/maps/*`

### 12.2. Парсер end-to-end (если есть TWOGIS_API_KEY)

- [ ] `POST /api/v1/maps/search` с маникюр/москва/[2gis] → 200 + search_id
- [ ] Через 30 сек `GET /api/v1/maps/search/{id}` → status `completed`
- [ ] `GET /api/v1/maps/search/{id}/companies?min_rating=4` фильтрует
- [ ] `GET /api/v1/maps/search/{id}/pain-tags` возвращает теги (если набралось достаточно отзывов)
- [ ] `POST /api/v1/maps/search/{id}/export?format=csv` скачивает файл

Если ключа нет — зафиксировать что end-to-end не проверен, тесты на моках все зелёные.

### 12.3. SSE

- [ ] curl `-N http://localhost:8000/api/v1/maps/search/{id}/stream` с cookies — стрим открывается, события приходят
- [ ] Завершение поиска отправляет `event: done` и закрывает соединение
- [ ] Другой пользователь не может открыть стрим чужого поиска

### 12.4. AI-пайплайн

- [ ] После парсинга отзывов запускается `analyze_reviews_for_company`
- [ ] Отзывы получают `sentiment` и `embedding` (если LLM доступны)
- [ ] После `recluster_pains_for_niche` создаются записи в `pain_tags`
- [ ] `review_pain_tags` и `company_pain_scores` заполняются
- [ ] Если LLM недоступен — graceful degradation: статус AI = `skipped`, sentiment остаётся derived from rating

### 12.5. Фронтенд

- [ ] `/app/leads` открывается, дефолт — «По сайтам»
- [ ] Старый поиск по сайтам по-прежнему работает (smoke test)
- [ ] Переключение на «По картам» рендерит MapsSearchPanel
- [ ] Сабмит формы → видны live-карточки (через SSE)
- [ ] Фильтры применяются (рейтинг, отзывы, негатив, owner replies, теги)
- [ ] 3 пресета фильтров работают
- [ ] Облако тегов кликается, фильтрует
- [ ] Карточка → Drawer с отзывами и тегами
- [ ] Экспорт CSV скачивает файл
- [ ] Пустые состояния отображаются

### 12.6. SQLAdmin

- [ ] /admin показывает новые разделы (Компании, Отзывы, Поиски карт, Боли, Кэш)
- [ ] Поиск по name работает
- [ ] Сортировка работает

### 12.7. Документация

- [ ] CHANGELOG.md обновлён
- [ ] docs/maps-audit-2026-05.md
- [ ] docs/maps-module-guide.md
- [ ] docs/maps-ai-pipeline.md
- [ ] docs/maps-final-qa-2026-05.md

**Финальный коммит:** `docs(maps): финальный QA отчёт`

---

## 13. Зависимости (requirements.txt / package.json)

### 13.1. Backend

Дописать в `backend/requirements.txt` (или `pyproject.toml`):

```
hdbscan==0.8.40             # кластеризация
pgvector==0.4.0             # SQLAlchemy adapter для VECTOR типа
numpy>=1.24                 # для clustering
```

`httpx`, `redis`, `celery`, `sqlalchemy`, `alembic`, `fastapi` — уже есть. `pydantic-settings` — уже есть.

### 13.2. Frontend

Если нет — добавить:
```
@tanstack/react-query  (если ещё нет, для useQuery)
```

EventSource — встроен в браузер, не требует пакета.

**Коммит:** `chore(maps): обновление зависимостей`

---

## 14. План работы — итоговая последовательность

```
ШАГ 0. Аудит + локальный запуск + ветка feature/maps-full
ШАГ 1. Миграция 015 (companies + reviews + cache + searches) + модели + тесты
ШАГ 2. Провайдер 2GIS + тесты
ШАГ 3. Провайдер Я.Карт + тесты
ШАГ 4. Сервис maps (save, кэш, агрегаты) + Celery parse_map_search + cron purge
ШАГ 5. Базовые API endpoints (без AI, без SSE) + тесты роутера
ШАГ 6. SQLAdmin views (Companies + Reviews + Searches + Cache)
       --- Smoke test: парсер end-to-end через curl, без AI и SSE ---
ШАГ 7. Миграция 016 (pain_tags + AI таблицы) + модели reviews_ai
ШАГ 8. Clustering + LLM-обёртки + sentiment + embeddings (service.py)
ШАГ 9. Pain matching + recluster + Celery analyze_reviews_for_company
ШАГ 10. API endpoints AI (pain-tags список, фильтр компаний по тегам)
ШАГ 11. SQLAdmin для PainTag
       --- Smoke test: AI-пайплайн на парсенных данных ---
ШАГ 12. Redis pub/sub + SSE endpoint + публикация событий в сервисе/задачах
       --- Smoke test: curl стрим работает ---
ШАГ 13. Frontend: API-клиент + переключатель режимов + LegacyLeadsPanel
ШАГ 14. Frontend: MapsSearchForm + useSearchStream
ШАГ 15. Frontend: фильтры + облако тегов + 3 пресета
ШАГ 16. Frontend: список + карточки + Drawer + экспорт
ШАГ 17. CHANGELOG + documentation + финальный QA
```

Каждый шаг = 1 или несколько коммитов. После каждого — `pytest` + smoke на UI.

---

## 15. Конец ТЗ

Готово к исполнению. **Не начинать шаг 1 без выполненного шага 0 (аудит).** При любых расхождениях с этим ТЗ — остановиться и спросить.
