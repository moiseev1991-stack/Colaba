# Deployment Worklog

History of deployment-related changes for Colaba. Update after each task (see AGENT_CONTEXT.md §10).

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
