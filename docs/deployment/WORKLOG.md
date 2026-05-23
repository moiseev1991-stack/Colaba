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
