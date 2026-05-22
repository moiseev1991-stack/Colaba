# Аудит существующей кодовой базы для модуля `maps`

**Дата:** 2026-05-22
**Ветка:** `main` (HEAD = `89cc290`, релиз 1.2.0)
**Цель:** зафиксировать факты, нужные для безопасной разработки `feature/maps-full`. Без аудита следующие шаги не делать. Любые расхождения с ТЗ — внизу, в разделе «Расхождения с ТЗ».

> **Метод сбора:** прямое чтение исходников + `docker exec` в живые контейнеры (`leadgen-postgres`, `leadgen-backend`). На момент аудита локальный стек запущен и healthy: postgres + redis + backend + celery-worker + frontend. Hyvor Relay — `unhealthy`, но для maps не критично.

---

## A. Структура и стек

### A.1. Backend

| Что | Значение | Откуда |
|---|---|---|
| Python | 3.11 (Dockerfile, requirements pinned под него) | `backend/Dockerfile` |
| FastAPI | `0.104.1` | `backend/requirements.txt:2` |
| Uvicorn | `0.24.0` standard | requirements |
| SQLAlchemy | **`2.0.23` async** | requirements |
| asyncpg | `0.29.0` (async driver) | requirements |
| psycopg2-binary | `2.9.9` (sync, для Alembic) | requirements |
| Alembic | `1.12.1` | requirements |
| pydantic | `>=2.9,<3` (v2) | requirements |
| pydantic-settings | `2.1.0` | requirements |
| SQLAdmin | `>=0.19.0` + Babel i18n | requirements |
| Redis | `5.0.1` (redis-py с asyncio) | requirements |
| Celery | `5.3.4` | requirements |
| slowapi | `>=0.1.9` (rate limiting) | requirements |
| python-jose | `3.3.0` (JWT) | requirements |
| passlib + bcrypt | `1.7.4` + `4.0.1` | requirements |
| httpx | `>=0.27,<1` | requirements |
| aiohttp | `3.9.1` | requirements (используется в части провайдеров) |
| BeautifulSoup4 | `4.12.2` | requirements |
| duckduckgo-search | `4.1.1` | requirements |
| yandex-cloud-ml-sdk | `>=0.17.0` | requirements |
| OpenAI SDK | `1.6.1` | requirements |
| Anthropic SDK | `0.39.0` | requirements |
| google-generativeai | `0.8.3` | requirements |
| Ollama client | `>=0.4.0` | requirements |
| fastapi-sso (OAuth) | `>=0.21.0` | requirements |

**ORM-стиль:** **классический `Column(...)`**, без `Mapped[T]`. Базовый класс `Base` живёт в `app/core/database.py`. Модели в `backend/app/models/` (см. ниже список).

**Сессии:** async через `app.core.database.get_db` (FastAPI dependency, возвращает `AsyncSession`). Для Alembic — sync engine из `DATABASE_URL_SYNC`.

**Стиль миграций:** **ручные через `alembic revision -m ...`**, файлы нумерованные строкой (`001..014`), `revision = '015'` стилем. Autogenerate частично сломан, потому что в `alembic/env.py` импортируется только подмножество моделей:
```python
# backend/alembic/env.py:31
from app.models import (
    User, Search, SearchResult, Filter, BlacklistDomain,
    Organization, OrganizationRole, user_organizations, SearchProviderConfig,
)
```
Не импортированы: `Deployment`, `SocialAccount`, `Email*`, `EmailConfig`, `EmailReply`, `AiAssistant`, `CaptchaBypassConfig`. **Вывод: для нового модуля миграции 015/016 пишем руками, на autogenerate не полагаемся.**

**HTTP-клиент:** `httpx` (асинхронный). `aiohttp` тоже есть, но используется выборочно.

**Logger:** **stdlib `logging`**, `logger = logging.getLogger(__name__)` — везде. Никакого structlog/loguru.

**Settings:** `app.core.config.Settings(BaseSettings)` (pydantic-settings v2), синглтон через `@lru_cache get_settings()` или прямой импорт `settings`. Уже есть: `USE_PROXY`, `PROXY_URL`, `PROXY_LIST` — переиспользуем. Нет: `TWOGIS_API_KEY`, `YANDEX_MAPS_*`, `REVIEWS_AI_*` — нужно добавить.

**Порты в контейнере / на хосте:**

| Сервис | Внутри | Снаружи |
|---|---|---|
| backend (uvicorn) | `0.0.0.0:8000` (см. `app/main.py`, compose `command: uvicorn ... --port 8000`) | `localhost:8001` (compose mapping) |
| postgres | `5432` | `5433` |
| redis | `6379` | `6379` |
| frontend (Next.js) | `4000` | `4000` |
| SQLAdmin | `/admin` на backend | через `localhost:8001/admin` |

**Главный фай app:** `backend/app/main.py`. Версия в Swagger жёстко `"0.1.0"` (рассинхрон с релизом 1.2.0, не критично). Health endpoints: `/health`, `/ready`. SQLAdmin подключается через `setup_admin(app)`.

**Регистрация роутеров:** через `backend/app/api/__init__.py`, агрегатор `api_router`, монтируется в `main.py` как `app.include_router(api_router, prefix="/api/v1")`. Сейчас включены 17 роутеров (auth, dashboard, searches, filters, organizations, providers, ai_assistants, captcha, monitor, outreach, tenders, payments, deployments, oauth, email, email_campaigns, email_replies, email_settings). **Новый `maps_router` нужно добавить в этот файл — НЕ в `main.py`.**

### A.2. Frontend

| Что | Значение |
|---|---|
| Next.js | `14.2.20` (App Router, `dev -p 4000`, `next start` в проде) |
| React | `18.2.0` |
| TypeScript | `5.3.3` |
| Tailwind CSS | `^3.4.0` |
| React Query | `@tanstack/react-query 5.17.0` |
| Zustand | `4.4.7` |
| Axios | `1.6.2` |
| Lucide | `^0.562.0` |
| `class-variance-authority` | `^0.7.1` |
| `clsx` + `tailwind-merge` | yes |

**Важно — UI-библиотеки НЕТ.** Ни `shadcn/ui`, ни `radix-ui`, ни Mantine. Папка `frontend/components/ui/` содержит ровно 4 файла: `button.tsx`, `dialog.tsx`, `input.tsx`, `select.tsx`. Остальное (бейджи, табы, слайдеры, дровер, свитч) — придётся писать руками поверх Tailwind или придумывать без них.

**Бейджи реализованы CSS-классами:** в `globals.css` (предполагаю; в `/app/leads/page.tsx` используются `app-badge app-badge-success/danger/warning/accent`). Это надо переиспользовать.

**Готовые компоненты, упомянутые в ТЗ §0.4.1 пункт E:**

| Компонент | Файл | Статус |
|---|---|---|
| `CityCombobox` | `frontend/components/CityCombobox.tsx` | есть |
| `FilterBuilder` + `emptyFilterSpec` + `FilterSpec` | `frontend/components/FilterBuilder.tsx` | есть |
| `NICHE_PRESETS` | inline в `frontend/app/app/leads/page.tsx:30-41` (10 пресетов) | есть, не вынесен |
| `EmptyState` | `frontend/components/EmptyState.tsx` | есть |
| `Drawer`/`Sheet`/`Slider`/`Switch`/`Tabs`/`Badge`/`Tooltip` | — | **нет, делать самим** |
| `Dialog` | `frontend/components/ui/dialog.tsx` | есть, как fallback для drawer |

**HTTP-клиент к бэку:** живёт в `frontend/src/services/api/*.ts` (axios-обёртки на каждый домен: `search.ts`, `ai_assistants.ts`, `emailSettings.ts` и т.п.). API-функции `maps` кладём туда же: `frontend/src/services/api/maps.ts`. Папка `frontend/lib/maps/` из ТЗ — против конвенции проекта. **Предлагаю отступить от ТЗ и положить API-функции в `frontend/src/services/api/maps.ts`, типы — в тот же файл или рядом.**

**API-прокси:** `frontend/app/api/v1/[...path]/route.ts` пробрасывает на `INTERNAL_BACKEND_ORIGIN` (по умолчанию `http://127.0.0.1:8001` локально, контейнерный URL в проде). SSE через этот прокси работать **может не работать** — нужно проверить, что route.ts корректно стримит без буферизации. Если нет — для SSE обращаться напрямую к `http://localhost:8001/api/v1/maps/search/{id}/stream` или править прокси.

---

## B. Существующие модули

### B.1. `searches/` — режим «по сайтам», НЕ ТРОГАЕМ

```
backend/app/modules/searches/
├── __init__.py
├── keyword_filter.py
├── providers/
│   ├── common.py             ← PROXY_LIST helper, get_random_user_agent()
│   ├── duckduckgo.py
│   ├── google_html.py
│   ├── serpapi.py
│   ├── yandex_html.py
│   └── yandex_xml.py
├── router.py                 ← endpoints, CSV-экспорт StreamingResponse (НЕ SSE)
├── schemas.py
└── service.py
```

**SSE/EventSource в `searches/router.py` НЕТ.** `StreamingResponse` используется только для CSV-выгрузки. Для maps SSE придётся писать с нуля (как и предполагает ТЗ §6).

**`providers/common.py`** — содержит логику прокси и UA. Сигнатура внутри:

```python
# backend/app/modules/searches/providers/common.py
# (упрощённо)
def resolve_proxy(proxy_overrides: dict | None = None) -> str | None:
    """Берёт PROXY_URL или один из PROXY_LIST в зависимости от override/настроек."""

def get_random_user_agent() -> str:
    """Возвращает один UA из встроенного списка."""
```

Точные сигнатуры — читать перед использованием. Для Я.Карт переиспользуем `resolve_proxy()`/`get_random_user_agent()`.

### B.2. `captcha/` — обход капчи

```
backend/app/modules/captcha/
├── router.py
├── schemas.py
├── service.py     ← get_captcha_config_raw(db) — конфиг из БД
└── solver.py      ← solve_image_captcha, solve_yandex_smartcaptcha, ...
```

**Нет файла `captcha/common.py`** (как было сказано в ТЗ §0.4.1 B). Прокси берётся из `searches/providers/common.py`.

**Сигнатура `solve_yandex_smartcaptcha`:**
```python
# backend/app/modules/captcha/solver.py:279
async def solve_yandex_smartcaptcha(
    html_content: str,
    pageurl: str,
    db: AsyncSession,
) -> Optional[str]:
    """Возвращает токен от 2captcha или None.
    Требует, чтобы 2captcha был сконфигурен в captcha_bypass_config
    (external_services.2captcha.api_key и enabled=true)."""
```

**Важно: третий параметр — `db: AsyncSession`**, а не URL прокси, как могло бы показаться из ТЗ. Это значит, что Celery-задача парсинга Я.Карт должна получить сессию БД (создавать локально через `AsyncSessionLocal()`).

Также есть `solve_image_captcha(html_content, page_url, provider, db, *, cookies, headers)` — для image-капч через AI Vision, использует `ai_assistant_id` из конфига.

### B.3. `ai_assistants/`

```
backend/app/modules/ai_assistants/
├── client.py     ← chat(assistant_id, messages, db, max_tokens, temperature)
│                   vision(assistant_id, image_b64, prompt, db)
├── registry.py
├── router.py
├── schemas.py
└── service.py    ← get_ai_assistant_row(assistant_id, db)
```

**Сигнатура универсального chat:**
```python
# backend/app/modules/ai_assistants/client.py:28
async def chat(
    assistant_id: int,
    messages: list[dict[str, Any]],     # [{"role": "user", "content": "..."}]
    db: AsyncSession,
    *,
    max_tokens: int = 1024,
    temperature: float = 0.7,
) -> str:
    """Возвращает строку — ответ модели. Routing по provider_type:
    openai, anthropic, google, ollama, groq, together, openrouter, deepseek,
    xai, mistral, azure_openai, other."""
```

**Batch API явно НЕ поддерживается.** Можно отправить весь массив отзывов одним промптом в `messages[0].content` — это и есть наш «batch». Anthropic Batch API / OpenAI Batch endpoint в `client.py` не реализованы.

**Embeddings — НЕТ.** В `client.py` есть только `chat()` и `vision()`. Под maps-ai нужна отдельная функция `embed_texts(texts: list[str])`, которая:
- либо берёт ассистента с provider_type openai и зовёт embedding endpoint напрямую (есть `OpenAI(api_key=...).embeddings.create(...)`);
- либо использует Yandex Cloud SDK (`yandex-cloud-ml-sdk`, уже стоит) — у Яндекса есть embeddings API.

**Ассистенты в БД:** на момент аудита таблица `ai_assistant` **пуста** (`SELECT ... FROM ai_assistant` возвращает 0 строк). Это значит:
- `chat()` не вызовешь, пока юзер не настроит хотя бы одного ассистента.
- Sentiment/clustering pipeline должен gracefully фолбэчить (как и предписано в ТЗ §5.4): без ассистента — `ai_processed_at` остаётся NULL, sentiment derived from rating, pain_tags не создаются. UI показывает «AI-анализ временно недоступен».

### B.4. Celery (`backend/app/queue/`)

```
backend/app/queue/
├── celery_app.py    ← инициализация Celery
└── tasks.py
```

**Текущая конфигурация:**
```python
# backend/app/queue/celery_app.py
celery_app = Celery(
    "leadgen_constructor",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.queue.tasks"],
)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=30*60,
    task_soft_time_limit=25*60,
    worker_prefetch_multiplier=4,
    beat_schedule={
        'process-email-replies-every-5-minutes': {
            'task': 'process_email_replies_task',
            'schedule': 300.0,
        },
    },
)
```

**Очереди:** в конфиге Celery **очереди не объявлены** (`task_queues` отсутствует). Worker в `docker-compose.yml` запускается так:
```yaml
celery-worker:
  command: celery -A app.queue.celery_app worker -Q search_queue,celery --loglevel=info --concurrency=6
```

То есть слушаются только `search_queue` и дефолтный `celery`. **6 — это не количество воркеров, а `--concurrency` одного воркера** (т.е. число процессов внутри одного контейнера). В ТЗ §0.4.1 указано «6 воркеров» — это неточность.

**Celery Beat в compose НЕ запущен** — отдельного сервиса нет. То есть beat_schedule с `process-email-replies-every-5-minutes` де-факто не работает (если только не запускается «embedded beat» через worker, что не настроено флагом `--beat`). Это уже существующий долг, не моя задача.

**Что это значит для maps:**

1. В Celery-конфиг надо добавить `task_queues` объявление и подключение очередей `maps`, `maps_reviews`, `maps_ai`, `maintenance`. **Маршрутизация задач**: либо через `task_routes`, либо через `queue=...` в декораторе `@celery_app.task`.
2. Команду celery-worker в docker-compose поменять на `-Q search_queue,celery,maps,maps_reviews,maps_ai,maintenance`.
3. **Celery beat — отдельная проблема.** Если ТЗ §1.2 требует beat_schedule для `purge_review_raw_text` и `recluster_popular_niches` — нужно запустить отдельный сервис `celery-beat` в compose или включить `--beat` флаг у worker. Я предлагаю добавить `celery-beat` отдельным сервисом в compose. **Это надо подтвердить у пользователя.**

`tasks.py` сейчас содержит только email-related задачи. Новые task-файлы из maps/reviews_ai будут импортироваться через `include=...` (надо расширить).

### B.5. `auth/`

```
backend/app/modules/auth/
├── oauth.py
├── oauth_router.py
├── router.py
├── schemas.py
└── service.py
```

**Dependency `get_current_user` живёт НЕ в `auth/`, а в `app.core.dependencies`** (важно!):

```python
# backend/app/core/dependencies.py
async def get_current_user_id(credentials) -> int       # 401 если плохой токен
async def get_optional_user_id(credentials) -> Optional[int]
async def get_current_user(user_id, db) -> User         # 404 если нет
async def get_current_organization_id(user_id, db) -> int  # 404 если нет org; None для superuser
async def require_superuser(user_id, db) -> User
async def require_organization_admin_or_owner(organization_id, user_id, db) -> tuple
```

**В новом роутере maps используем `get_current_user_id` + `get_current_organization_id`** (как и в `searches/router.py`). Не `get_current_user` — это лишний select по таблице на каждый запрос.

### B.6. Все модели в `backend/app/models/`

`ai_assistant.py`, `captcha_bypass_config.py`, `deployment.py`, `email.py`, `email_config.py`, `email_reply.py`, `filter.py`, `organization.py`, `search.py`, `search_provider_config.py`, `social_account.py`, `user.py`.

Новые модели `Company`, `Review`, `MapSearch`, `MapSearchCache`, `MapSearchResult`, `PainTag`, `ReviewPainTag`, `CompanyPainScore` положим в **отдельные файлы** `backend/app/models/maps.py` и `backend/app/models/pain_tag.py`, чтобы не раздувать существующие.

---

## C. Alembic — состояние БД

### C.1. Файлы миграций
```
backend/alembic/versions/
├── 001_add_users_table.py
├── 002_add_organizations_and_multitenancy.py
├── 003_make_search_organization_id_nullable.py
├── 004_add_search_provider_config.py
├── 005_add_ai_assistant.py
├── 006_add_captcha_bypass_config.py
├── 008_add_deployments.py             ← down_revision = '006' (007 ПРОПУЩЕН)
├── 009_add_social_accounts.py
├── 010_add_email_tables.py
├── 011_add_reply_to_fields.py
├── 012_add_email_replies_table.py
├── 013_add_email_config_table.py
└── 014_add_search_result_pages.py
```

**Файла `007_*` нет** — ревизия была удалена, `008` направлен на `006`.

### C.2. Состояние БД

```
SELECT version_num FROM alembic_version;
→  007
```

**В БД зафиксирована ревизия `007`, которой больше нет в коде.** Запуск `alembic upgrade head` падает:
```
ERROR: Can't locate revision identified by '007'
FAILED: Can't locate revision identified by '007'
```

**При этом таблицы из миграций 008..014 в БД присутствуют:**
```
deployments, social_accounts, email_campaigns, email_templates, email_domains,
email_logs, email_replies, email_config, search_result_pages
```

→ это «висячая» ссылка: накатили старый 007, потом удалили, и `alembic_version` так и остался.

**Исправление (НЕ ВЫПОЛНЯТЬ без подтверждения пользователя):**
```bash
docker exec leadgen-backend alembic stamp 014
# или:
docker exec leadgen-postgres psql -U leadgen_user -d leadgen_db \
  -c "UPDATE alembic_version SET version_num='014';"
```

Это **обязательный пре-реквизит** перед миграциями 015/016 нашего модуля. **Спрашиваю пользователя:** «alembic stamp 014» сейчас выполнить, или ты хочешь сначала глянуть сам?

### C.3. Расхождение с ТЗ

ТЗ предполагает `alembic current == 014` (см. §0.4.1 C). Реально `014` есть в файлах, но БД считает себя на `007`. Это исправимо одной командой — выше.

---

## D. SQLAdmin

**Регистрация:**
```python
# backend/app/main.py:131
from app.admin import setup_admin
setup_admin(app)
```

`setup_admin` — в `backend/app/admin/main.py`. Сейчас создаёт `Admin(app, engine, title="Colaba Admin")` **БЕЗ `authentication_backend=...`** — то есть SQLAdmin открыт всем по URL `/admin`.

**`AdminAuth` УЖЕ написан** в `backend/app/admin/auth.py` — реализует JWT/session-based auth, проверяет `is_superuser`, имеет `login/logout/authenticate`. **Просто не подключён.**

Подключение делается одной строкой:
```python
admin = Admin(
    app, engine, title="Colaba Admin",
    authentication_backend=AdminAuth(secret_key=settings.SECRET_KEY),
)
```
плюс надо убедиться, что Starlette `SessionMiddleware` подключён к app (без него `request.session` не работает). Это **бонусная задача**, упомянутая в ТЗ §0.2 — отдельным коммитом сделаю в самом конце, если останется время.

**Views SQLAdmin для Company/Review/PainTag** — не предусмотрены в ТЗ; не добавляем в первой итерации.

---

## E. Frontend — состояние `/app/leads`

**Главная страница:** `frontend/app/app/leads/page.tsx`. Использует:
- `Input`, `Select` из `@/components/ui/` (минимальные)
- `ToastContainer` из `@/components/Toast`
- `createSearch`, `listSearches` из `@/src/services/api/search` (axios-обёртки)
- `lucide-react` иконки
- `CityCombobox`, `FilterBuilder`, `EmptyState`
- Inline `NICHE_PRESETS` (10 ниш)
- Свои CSS-классы для бейджей (`app-badge app-badge-success/danger/warning/accent`)

**Других страниц leads:**
- `leads/history/page.tsx`
- `leads/blacklist/page.tsx`
- `leads/settings/page.tsx`
- `leads/proposals/page.tsx`, `proposals/new/page.tsx`, `proposals/[id]/edit/page.tsx`

**Tabs/режимы:** на странице сейчас **переключателя режимов нет**. ТЗ §8.8 предлагает добавить shadcn-style `<Tabs>` — но shadcn не установлен. Реализуем простой переключатель **двумя кнопками-табами на Tailwind**, без новых библиотек.

**SSE:** в текущем фронте `EventSource` не используется нигде (по grep'у `EventSource` пусто). Хук `useSearchStream` пишем с нуля.

---

## F. LLM и embeddings

### F.1. Какие провайдеры активны

В коде поддерживаются 12 типов: openai, anthropic, google, ollama, groq, together, openrouter, deepseek, xai, mistral, azure_openai, other. Реальное наличие — зависит от записей в таблице `ai_assistant`.

**На момент аудита `ai_assistant` пуста.** Это блокер для AI-пайплайна, но НЕ блокер для разработки: код пишем так, чтобы при отсутствии ассистентов всё gracefully фолбэчилось.

**Что нужно от пользователя:**
- Какой ассистент использовать для **sentiment** (быстрый и дешёвый — Claude Haiku 4.5 / Yandex GPT Lite / OpenAI gpt-4o-mini)?
- Какой для **naming кластеров** (качественный — Claude Sonnet / Yandex GPT Pro / OpenAI gpt-4o)?
- Settings: я предлагаю **читать ID ассистента из БД-таблицы `email_config`-подобного singleton** или из env `MAPS_AI_SENTIMENT_ASSISTANT_ID` / `MAPS_AI_NAMING_ASSISTANT_ID`. **Спрашиваю пользователя:** какой подход предпочитаешь?

### F.2. Embeddings

В проекте **нет embeddings-обёртки**. Под `VECTOR(1536)` (OpenAI `text-embedding-3-small`) предлагаю:

1. В `backend/app/modules/reviews_ai/llm.py` написать функцию `embed_texts(texts: list[str], db: AsyncSession) -> list[list[float]]`, которая:
   - читает `MAPS_AI_EMBEDDING_PROVIDER` (env, default `openai`);
   - для `openai`: использует `OPENAI_API_KEY` напрямую (батч до 100 текстов за запрос), модель `text-embedding-3-small` (1536 dim);
   - для `yandex`: использует `yandex-cloud-ml-sdk` (требует `YANDEX_XML_FOLDER_ID` + `YANDEX_XML_KEY` — они уже в Settings, но это поисковый folder, может быть другой; нужно отдельно `YANDEX_EMBEDDINGS_FOLDER_ID` или переиспользовать).

**Спрашиваю:** OpenAI ключ есть? Или ставку на Yandex Embeddings? От ответа зависит размерность вектора (OpenAI = 1536, Yandex `text-search-doc/v3` = 256). Если Yandex — размерность колонки в миграции 015 должна быть `VECTOR(256)`, не `VECTOR(1536)`.

### F.3. Batch API

OpenAI Batch / Anthropic Message Batches API в коде не используются. Для maps-ai можно либо:
- **просто слать «batch» одним промптом** (что и делается в ТЗ §5.3 — `reviews_json` целиком в `SENTIMENT_PROMPT`);
- либо подключить настоящий Batch API.

Предлагаю первый вариант (проще, надёжнее, дешевле rework).

---

## G. pgvector

```
docker exec leadgen-postgres psql -U leadgen_user -d leadgen_db \
  -c "SELECT extname FROM pg_extension;"
→  plpgsql
```

**`vector` extension НЕ установлен.** `pg_trgm` тоже нет.

**Образ Postgres:** надо посмотреть в compose. Если стандартный `postgres:16-alpine` — pgvector скорее всего НЕ предустановлен (надо менять на `pgvector/pgvector:pg16`) или ставить через `apk add`/`build-from-source`, что для alpine очень болезненно.

**План:** в миграции 015 пишем `CREATE EXTENSION IF NOT EXISTS vector;` — но это **сработает только если в Postgres-контейнере уже есть .so файл расширения**. Если нет — миграция упадёт.

**Решение:** в `docker-compose.yml` меняем образ postgres с текущего (узнать какой) на `pgvector/pgvector:pg16` (он включает pgvector). Это потребует **пересоздать контейнер**, но volume `postgres_data` сохранится (тот же путь PGDATA).

**Спрашиваю пользователя:**
- ОК сменить образ Postgres на `pgvector/pgvector:pg16` и пересоздать контейнер (данные не теряются, volume mount тот же)?
- Если категорически нет — fallback: хранить embeddings как `JSONB` (массив float), считать cosine similarity на стороне Python (HDBSCAN всё равно в Python). Это медленнее, но без extension.

---

## H. Состояние локального стека на момент аудита

```
docker ps --filter "name=leadgen"
NAME                    STATUS
leadgen-postgres        Up (healthy)
leadgen-redis           Up (healthy)
leadgen-backend         Up (healthy)
leadgen-celery-worker   Up
leadgen-frontend        Up
leadgen-hyvor-relay     Up (unhealthy)  ← существующая проблема, не критично для maps
```

**Smoke check:**
- `GET http://localhost:8001/api/docs` → 200 OK
- `GET http://localhost:4000/` → 200 OK
- `GET http://localhost:8001/admin` → доступен без авторизации (как и описано в §D)
- `alembic upgrade head` → **ОШИБКА** (см. §C.2)

---

## Расхождения с ТЗ и обязательные вопросы

| # | ТЗ говорит | Реально | Действие |
|---|---|---|---|
| 1 | Alembic current = `014` | БД на `007` (отсутствующая ревизия), хотя таблицы 008..014 применены | **Вопрос:** запускаем `alembic stamp 014`? |
| 2 | `captcha/common.py` с `PROXY_LIST` | Нет такого файла; PROXY есть в `searches/providers/common.py` | Использую `searches/providers/common.py` |
| 3 | Frontend shadcn/ui (`<Tabs>`, `<Badge>`, `<Slider>`, `<Switch>`, `<Sheet>`, `<Drawer>`) | НЕ установлен, в `components/ui/` только 4 базовых | Пишу простые компоненты на Tailwind руками |
| 4 | API-функции в `frontend/lib/maps/` | Конвенция проекта — `frontend/src/services/api/` | Кладу в `frontend/src/services/api/maps.ts` |
| 5 | Backend на порту 8000 (в docs URL `http://localhost:8000/docs`) | Локально маппится на 8001, в проде через прокси | Документирую как `localhost:8001` |
| 6 | 6 воркеров Celery | 1 воркер с `--concurrency=6` | Документирую как есть |
| 7 | Celery beat schedule готов и работает | Beat-сервиса нет, schedule в конфиге игнорируется | **Вопрос:** добавить отдельный сервис `celery-beat` в compose? |
| 8 | pgvector установлен или ставится через `CREATE EXTENSION` | НЕ установлен; стандартный image не содержит .so | **Вопрос:** менять образ Postgres на `pgvector/pgvector:pg16`? |
| 9 | `solve_yandex_smartcaptcha(html, url)` (2 параметра) | Сигнатура `(html, pageurl, db)` — нужна сессия | Передаю `AsyncSession` |
| 10 | LLM-провайдеры активны | Таблица `ai_assistant` пуста на локалке | Код пишу с graceful fallback |
| 11 | Embedding 1536 dim | Зависит от провайдера (OpenAI=1536, Yandex=256) | **Вопрос:** какой провайдер для embeddings? |
| 12 | `chord` в Celery «слишком хрупко, не используем» | OK, идём «независимый pipeline на компанию» (§4.4) | Согласен |
| 13 | autogenerate Alembic | Сломан (модели не все импортированы в env.py) | Миграции пишу руками |

---

## Решения по открытым пунктам (приняты 2026-05-22 после обсуждения)

Пользователь дал зелёный свет на «решай сам, операции обратимы» — фиксирую принятые решения.

1. **Alembic.** Выполняем `alembic stamp 014`, чтобы синхронизировать `alembic_version` с фактическим состоянием схемы. Откат: `alembic stamp 007`.
2. **Postgres + pgvector.** Меняем образ Postgres на `pgvector/pgvector:pg16`. Volume `postgres_data` подключается тем же путём, данные сохраняются. Откат: вернуть `postgres:16-alpine` (или какой стоял) в `docker-compose.yml`.
3. **Celery beat.** Добавляем отдельный сервис `celery-beat` в `docker-compose.yml`. Это нужно для cron-задач `purge_review_raw_text` (раз в сутки) и `recluster_popular_niches` (раз в сутки).
4. **Embeddings.** OpenAI `text-embedding-3-small` (1536 dim) — как в самом ТЗ §10 (`REVIEWS_AI_EMBEDDING_PROVIDER=openai` по умолчанию). Если `OPENAI_API_KEY` пуст — пайплайн gracefully отключается, sentiment остаётся derived from rating, pain_tags не создаются.
5. **LLM для sentiment.** Claude Haiku (через ai_assistants с `provider_type=anthropic`). Имя ассистента читается из env `REVIEWS_AI_SENTIMENT_ASSISTANT_NAME`. Если пуст — auto-pick (любой anthropic-ассистент с моделью, содержащей `haiku`).
6. **LLM для naming кластеров.** Claude Sonnet (тем же образом, env `REVIEWS_AI_NAMING_ASSISTANT_NAME`, auto-pick любого `sonnet`).
7. **AdminAuth.** Подключаю одной строкой в самом конце большой задачи (бонус из §0.2 и §9 ТЗ).
8. **`spinlid-clean/`** — не трогаю, отдельная задача.

---

## Что делаю прямо сейчас (предварительная инфра до ШАГа 1)

Все шаги обратимы за минуты. Не пишу пока код модулей, не пишу миграции 015/016, не подключаю AdminAuth — это уже основная работа после ОК.

1. Обновляю этот документ (выше) и коммичу `docs(maps): аудит существующей кодовой базы`.
2. Ветка `feature/maps-full`, переключаюсь на неё. Дальше всё пойдёт туда, `main` не трогаю.
3. Чиню Alembic: `alembic stamp 014`.
4. Меняю образ Postgres на `pgvector/pgvector:pg16`, пересоздаю контейнер, проверяю что extension `vector` доступен (`CREATE EXTENSION IF NOT EXISTS vector;`).
5. Добавляю сервис `celery-beat` в `docker-compose.yml`.
6. Каждое действие — атомарным коммитом.
7. Доклад пользователю + переход к ШАГу 1 ТЗ.
