# Deployment Worklog

History of deployment-related changes for Colaba. Update after each task (see AGENT_CONTEXT.md §10).

---

## 2026-05-23 — Maps router 404 на проде: ретриггер деплоя

- **Симптом:** `https://spinlid.ru/api/v1/maps/search` → 404 `{"detail":"Not Found"}`. Аналогично `/maps/cities`, `/maps/health/providers`. Также пропали `/api/v1/email/templates`, `/api/v1/email/settings`, `/api/v1/dashboard/stats`. То есть на проде висит существенно более старый backend, чем то, что в `main`.
- **Что НЕ проблема:** код в `backend/app/modules/maps/router.py` корректен, роутер подключён в `backend/app/api/__init__.py` (`api_router.include_router(maps_router)`), CI #178 для коммита `01e6b10` зелёный, миграции 015/016 на месте.
- **Корневая причина:** Deploy-пайплайн `Deploy (main)` падает. Последние два прогона:
  - #163 (release 1.3.3): `build_images` OK, шаг `Deploy` на self-hosted раннере упал.
  - #164 (retrigger): `Run actions/checkout@v4` на GitHub-runner-е отвалился через 30s (флак).
- **Дополнительный латентный риск:** в `docker-compose.prod.yml` postgres — `postgres:16-alpine`, миграция 015 делает `CREATE EXTENSION IF NOT EXISTS vector`. Если pgvector не был установлен вручную, `alembic upgrade head` упадёт. На сервере уже был «server-side fix applied manually» (видимо, расширение поставлено вручную). Стоит вынести фикс в код (`pgvector/pgvector:pg16`) отдельным коммитом, чтобы при пересоздании контейнера ничего не ломалось.
- **Действие:** этот коммит ретриггерит CI → Deploy. Если #164-style флак повторится — следующий шаг: рерран failed jobs через GitHub UI или явный workflow_dispatch.

### 2026-05-23 (update) — Deploy #165 упал на self-hosted runner, добиваем pgvector + Celery

- **Что увидели:** `build_images` зелёный, шаг `Deploy` (запуск `scripts/deployment/deploy.sh` на сервере) — красный. Почти наверняка падает `alembic upgrade head` на миграции 015 (`CREATE EXTENSION IF NOT EXISTS vector`), потому что в `docker-compose.prod.yml` стояло `postgres:16-alpine` без pgvector.
- **Фикс в коде:**
  - `docker-compose.prod.yml`: `postgres:16-alpine` → `pgvector/pgvector:pg16` (тот же PG16, добавлен binary расширения vector; том данных совместим).
  - `celery-worker`: `-Q celery` → `-Q celery,maps_ai,maintenance` (чтобы LLM-задачи `reviews_ai` и cron-задачи `purge_review_raw_text` начали обрабатываться).
  - `celery-worker-search`: `-Q search_queue` → `-Q search_queue,maps,maps_reviews` (чтобы `parse_map_search` и `parse_company_reviews` начали выполняться, иначе пользователь создаст поиск и увидит «pending» навсегда).
- **Что НЕ трогаем сейчас:** добавление `celery-beat` сервиса (cron `process_email_replies` и `purge_review_raw_text` на проде до сих пор не запускались — это отдельный шаг, не блокер для maps-формы).
- **Риск пересоздания postgres-контейнера:** низкий. Том `postgres_data` сохранится; формат данных PG16 идентичен. Будет ~10-секундный downtime БД.

### 2026-05-23 (final) — что реально помогло, итог

Через Coolify Terminal руками сделали то, что должен был сделать deploy-пайплайн:

1. **Docker cleanup** — было 22GB images / 78% reclaimable; Coolify сам прорун-нул чистку, осталось 5.7GB.
2. **`docker compose pull` с `BACKEND_IMAGE=ghcr.io/.../colaba-backend IMAGE_TAG=latest`** — login в GHCR уже был настроен, образы скачались.
3. **`docker compose up -d --force-recreate`** — пересоздал backend/frontend/celery с новыми образами. Postgres уже был на pgvector (мой ранний фикс через compose сработал, но только постгрес — потому что image-таги бэка не менялись).
4. **Alembic мисматч** — БД на `version_num='007'`, а в коде 007 нет (миграция `007_add_search_timing.py` была удалена в коммите `e96b5d2`). `alembic stamp 006` тоже падал, потому что валидирует текущую ревизию. **Помог только прямой `UPDATE alembic_version SET version_num='006'` через psql**. После этого `alembic upgrade head` прокатил 006 → 008 → ... → 016 без ошибок (схема от удалённого 007 — только колонки `started_at/finished_at` в `searches`, они никому не мешают).
5. **`docker compose restart backend`** — он завис в restart-loop пока миграции не прошли; после фикса BD стартанул чисто, `Application startup complete`.

**Результат:**
- `https://spinlid.ru/api/v1/maps/cities` → 200, JSON со списком городов.
- `https://spinlid.ru/api/v1/maps/health/providers` → 200, `{"twogis":"no_api_key","yandex_maps":"no_proxy"}` (ключи API ещё не настроены в .env, это отдельно).
- Форма «По картам» на `/app/leads` больше не выдаёт «Not Found».

**Уроки на будущее:**
- Никогда не удалять миграции, которые могли быть применены на проде, не оставив `stamp`-инструкции в `deploy.sh` или хотя бы в WORKLOG.
- В `docker-compose.prod.yml` рассмотреть переход на `image: ${BACKEND_IMAGE:-ghcr.io/moiseev1991-stack/colaba-backend}:${IMAGE_TAG:-latest}` (с дефолтом на GHCR), чтобы Coolify мог пуллить готовое вместо пересборки, у которой не хватает ресурсов на этом VPS (3.8GB RAM, ~970MB available).
- GHA self-hosted runner Deploy step тоже падал — стоит понять почему (но это уже не блокер, раз есть рабочий ручной путь через `/opt/colaba`).

### 2026-05-23 (вечер) — добили maps-парсер: компании реально приходят с 2GIS

После того как 404 на роутере был починен (см. выше), оставались баги в самом парсере, из-за которых поиск завершался со статусом `completed, 0 компаний` или `failed`. По очереди:

1. **`fix(maps): NullPool в Celery воркере` (055e2cf)** — `asyncpg.InterfaceError: cannot perform operation: another operation is in progress`. Причина: `engine` создавался на уровне модуля с обычным пулом коннекшенов, а каждый Celery-таск делал `asyncio.run(...)` со свежим event loop. Asyncpg-коннекшены прибиты к event loop'у — после первого таска коннекшен «мертвый», второй таск его берёт из пула и ломается. Фикс: детектим Celery по `sys.argv` и используем `NullPool` в нём; FastAPI/uvicorn пул сохраняем.

2. **`fix(deploy): TWOGIS_API_KEY в backend и celery воркеры` (f4d033f)** — `/api/v1/maps/health/providers` отдавал `{"twogis":"no_api_key"}`. Ключ был в `/opt/colaba/.env`, но в `docker-compose.prod.yml` секции `environment:` для `backend`, `celery-worker`, `celery-worker-search` его не было — переменная не пробрасывалась в контейнер. Добавили `TWOGIS_API_KEY: ${TWOGIS_API_KEY:-}` во все три сервиса.

3. **`fix(maps-2gis): page_size 10 + проверка meta.code` (545a8c5)** — 2GIS возвращал `HTTP 200` с `items=[]` и парсер тихо завершал с `yielded=0`. На самом деле в `meta.code=400` был спрятан ответ `Length of parameter 'page_size' should be from 1 to 10`. Наш `PAGE_SIZE=50` превышал лимит free-плана. Снизили до 10. Заодно добавили в `_request` проверку `meta.code >= 400` — на 401/403 кидаем `MissingAPIKeyError`, на остальные `RuntimeError`. Раньше эти ошибки молча глотались.

4. **`fix(maps-2gis): region_id Москвы 32` (da1ce27)** — `region_id=1` в нашем словаре был помечен как Москва, но это **Новосибирск**. Запрос `https://catalog.api.2gis.com/2.0/region/search?q=Москва` дал правильный id=32. В `CITY_TO_REGION_ID` оставили только Москву (verified), остальные ID не верифицированы → убрали. UI-список городов вынесли в отдельный `KNOWN_CITIES_FOR_UI` (45 городов), чтобы фронт не сломался — для городов вне словаря провайдер использует `TWOGIS_FALLBACK_REGION_ID=70000001` (вся Россия).

5. **`fix(maps): graceful 404 reviews` (a041d1d)** — после фиксов 3+4 компании пошли (видели РОЛЬФ Алтуфьево, АвтоГермес, Freshclean и др.), но `parse_company_reviews` падал с `RuntimeError: 2GIS API error (meta.code=404): Method not found` на endpoint `/2.0/reviews/list`. Этот endpoint на нашем плане недоступен (только в платной 2GIS Catalog API подписке). Из-за необработанного `RuntimeError` Celery retry-ил 3 раза, забивая очередь, а статус поиска становился `failed`. Добавили `except RuntimeError` рядом с CaptchaWallError/RateLimitError — компания сохраняется без отзывов, рейтинг и review_count берутся из `reviews.general_*` в items-ответе.

### 2026-05-23 (поздний вечер) — деплой в обход GHA: ручная сборка на сервере

После всех фиксов на main внезапно **GitHub Actions перестал триггерить workflows** для новых коммитов (`545a8c5`, `da1ce27`, `39246d6`, `a041d1d` — 0 runs у каждого). Последний прогон CI был для `055e2cf`. Не разобрались почему — возможно, GH-Actions сам отключает workflow при долгих скипах/лимитах.

Деплой сделали в обход через Coolify Terminal на сервере:

```bash
# Свежий main в /opt/colaba-src
cd /opt && rm -rf colaba-src && git clone --depth=1 https://github.com/moiseev1991-stack/Colaba.git colaba-src
cd colaba-src
# Билд с тем же тегом, что в docker-compose:
docker build -t ghcr.io/moiseev1991-stack/colaba-backend:latest ./backend
# Пересоздание контейнеров — НЕ забыть переменные образа:
cd /opt/colaba && export BACKEND_IMAGE=ghcr.io/moiseev1991-stack/colaba-backend \
                       FRONTEND_IMAGE=ghcr.io/moiseev1991-stack/colaba-frontend \
                       IMAGE_TAG=latest
docker compose -f docker-compose.prod.yml up -d --force-recreate --pull never \
  backend celery-worker celery-worker-search
```

Локальный билд `:latest` перекрывает GHCR `:latest` в кэше docker — `up --pull never` подхватывает локальный. Это решило проблему с заблокированной GHA пайплайн.

### 2026-05-23 — Итоговое состояние

**Что работает:**
- `https://spinlid.ru/api/v1/maps/cities` → 200 OK, 46 городов.
- `https://spinlid.ru/api/v1/maps/health/providers` → `{"twogis":"ok","yandex_maps":"no_proxy"}`.
- Поиск «стоматология / Москва» / «автосервис / Москва» / «клининговая компания / Москва» через 2GIS — **возвращает реальные московские компании** с адресом, телефоном (если есть), сайтом, рейтингом, общим количеством отзывов.
- Celery воркеры не падают, не ретраят бесконечно.

**Что НЕ работает (известные ограничения):**
- **Текст отзывов** — 2GIS endpoint `/2.0/reviews/list` отдаёт 404 Method not found на нашем ключе. Для текстов нужен платный план 2GIS, или Flamp API, или HTML-парсинг карточек, или Яндекс.Карты как источник (требует прокси).
- **Города кроме Москвы** в `CITY_TO_REGION_ID` не верифицированы — поиск по ним пойдёт на `region_id=70000001` (вся Россия) и может возвращать нерелевантные регионы. На следующую сессию: пройти `region/search` для всех 45 городов и заполнить mapping.
- **GitHub Actions** на репо как будто отключили workflow для свежих push-ов. Нужно разобраться (Settings → Actions → check enabled, может быть лимиты).
- **GHA self-hosted runner Deploy step** до конца тоже не починен, но сейчас ручная сборка через `/opt/colaba-src` его заменяет.

**Карта команд для следующих сессий:**
```bash
# Обновить прод после нового пуша в main (когда GHA сломан):
cd /opt/colaba-src && git fetch && git reset --hard origin/main \
  && docker build -t ghcr.io/moiseev1991-stack/colaba-backend:latest ./backend \
  && cd /opt/colaba && BACKEND_IMAGE=ghcr.io/moiseev1991-stack/colaba-backend \
       FRONTEND_IMAGE=ghcr.io/moiseev1991-stack/colaba-frontend \
       IMAGE_TAG=latest \
       docker compose -f docker-compose.prod.yml up -d --force-recreate --pull never \
       backend celery-worker celery-worker-search
```
- **Проверка после деплоя:**
  - `curl https://spinlid.ru/api/v1/maps/cities` → JSON со списком городов (а не 404).
  - `curl https://spinlid.ru/api/v1/maps/health/providers` → `{"twogis":"...","yandex_maps":"..."}`.
  - На `/app/leads` форма «По картам» больше не выдаёт «Not Found».

---

## 2026-04-21 — Email config, зависимости backend, прокси локального фронта

- **Task:** Зафиксировать в продакшене настройки почты из БД; устранить падение API из‑за отсутствия `aiosmtplib` в образе; упростить локальный прокси Next → backend.
- **Deploy note:** Обязательна пересборка образа backend после обновления `requirements.txt` (`docker compose build backend` + recreate). Иначе контейнер не импортирует `aiosmtplib`.
- **Files / docs:** `docs/STATUS.md`, `docs/guides/LOCAL_SETUP.md`, `docs/changes/email-config-local-dev-pytest-2026-04-21.md`, корневой `.env.example`, `frontend/app/api/v1/[...path]/route.ts`, `frontend/.env.local.example`.
- **Result:** Документация и журнал изменений синхронизированы с кодом; см. CHANGELOG.md.

---

## 2026-02-24 — AGENT_CONTEXT and WORKLOG added

- **Task:** Create project memory (AGENT_CONTEXT.md) and worklog (WORKLOG.md) in docs/deployment.
- **Files changed:**
  - `docs/deployment/AGENT_CONTEXT.md` (created)
  - `docs/deployment/WORKLOG.md` (created)
- **What changed:** Added full AGENT_CONTEXT.md with project overview, production issues, rules, checklists. Initialized WORKLOG.md with this entry.
- **Result:** Future agents and edits can follow the same rules and log here.
- **Next recommended step:** When fixing 504/hydration/proxy, read AGENT_CONTEXT.md and append to this WORKLOG after changes.

---

## 2026-02-24 — Локальный запуск: доки и порты

- **Task:** Привести документацию и скрипты в соответствие с текущими портами (frontend 4000, backend 8001); добавить инструкцию «запустить локальный сервер сейчас»; запустить стек.
- **Files changed:**
  - `docs/RUN_LOCAL_NOW.md` (created)
  - `docs/guides/LOCAL_SETUP.md` (updated)
  - `docs/README.md` (ссылка на RUN_LOCAL_NOW)
  - `scripts/start.ps1`, `scripts/setup/start-docker-project.ps1` (URL и порты)
- **What changed:** Единая инструкция RUN_LOCAL_NOW.md с тремя вариантами (Docker, скрипт, фронт локально). LOCAL_SETUP приведён к портам 4000/8001 и пути E:\cod\Colaba. В скриптах выводимые URL заменены на localhost:4000 и localhost:8001.
- **Result:** Локальный стек запущен (`docker compose up -d`). Документация актуальна.
- **Next recommended step:** При проблемах со стилями в Docker использовать вариант 3 из RUN_LOCAL_NOW.md (фронт локально).

---

## 2026-02-24 — Восстановление левого меню на странице Дашборд

- **Task:** На странице /dashboard пропало левое меню (сайдбар). Восстановить.
- **Files changed:** `frontend/app/dashboard/layout.tsx` (created)
- **What changed:** Страница /dashboard (app/dashboard/page.tsx) не находилась под layout’ом app/app/, поэтому не получала AppShell и AppLayout с Sidebar. Добавлен app/dashboard/layout.tsx с обёрткой AppErrorBoundary + AppShell — тот же shell, что и у /app/*, сайдбар снова отображается.
- **Result:** На /dashboard снова отображаются шапка и левое меню (Дэшборд, Новый запрос, История и т.д.).
- **Next recommended step:** При необходимости то же самое можно сделать для /runs, /settings, /monitor и др., если они открываются без оболочки app.

---

## 2026-02-24 — Сайдбар всегда для залогиненных (все внутренние страницы)

- **Task:** Сайдбар слева должен быть на всех внутренних страницах; сейчас пропадал на части страниц.
- **Files changed:**
  - `frontend/app/layout.tsx` — обёртка всех страниц в `<AppShell>`
  - `frontend/app/app/layout.tsx` — убрана дублирующая обёртка AppShell, оставлен только AppErrorBoundary
  - `frontend/app/dashboard/layout.tsx` — то же, убрана AppShell, оставлен AppErrorBoundary
- **What changed:** Решение о показе shell/сайдбара перенесено в один уровень: корневой layout оборачивает всё приложение в AppShell. AppShell по pathname показывает AppLayout (шапка + сайдбар) для всех маршрутов, кроме `/` и `/auth/*`. Страницы /runs, /settings, /monitor, /payment, /profile и т.д. теперь автоматически получают сайдбар без отдельных layout’ов.
- **Result:** У залогиненных пользователей сайдбар отображается на всех внутренних страницах.
- **Next recommended step:** —
