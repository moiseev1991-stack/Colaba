# AGENTS.md — Единый источник правил для всех ИИ-агентов и разработчиков

> **Это главный файл правил проекта.** Его читают **все** ИИ-ассистенты: ZCode, Claude Code, Cursor (через ссылку в `.cursor/rules/*.mdc`), а также любые другие инструменты.
> Файлы `.cursorrules`, `.cursor/rules/*.mdc`, `docs/guides/*_RULES.md` — **вторичны** и ссылаются сюда. При расхождении источник правды — этот файл.

**Проект:** Colaba — SaaS-платформа для генерации лидов (FastAPI + Next.js).
**Стек:** Backend — Python 3.11, FastAPI, SQLAlchemy 2.0 (async), Alembic, PostgreSQL 16 (pgvector), Redis, Celery. Frontend — Next.js 14 (App Router), TypeScript, React, TailwindCSS, shadcn/ui.

---

## 1. Структура монорепозитория

```
colaba2402/
├── backend/              # FastAPI backend (Python)
│   ├── app/              # Код приложения (ВСЕ .py файлы — только здесь)
│   ├── tests/            # Тесты
│   └── scripts/          # Служебные backend-скрипты (init_test_db и т.д.)
├── frontend/             # Next.js frontend (TypeScript/React) — ВСЕ .ts/.tsx — только здесь
├── scripts/              # Скрипты (setup/, deployment/) — НЕ в корне
├── docs/                 # Вся документация
│   ├── STATUS.md         # Единый файл статуса проекта (что реально работает)
│   ├── ROADMAP.md        # Дорожная карта развития
│   └── ...
├── .github/workflows/    # CI/CD
├── .hermes/COORDINATION.md  # Координация между разработчиками/агентами
└── docker-compose*.yml   # Docker-конфигурация
```

**Корень содержит ТОЛЬКО конфигурационные файлы** (docker-compose, .env.example, README.md, CHANGELOG.md, AGENTS.md). Никакого кода и никакой документации в корне, кроме README.md и CHANGELOG.md.

---

## 2. Правила размещения файлов

| Что                     | Куда                                                                                  | Запрещено                                        |
| ----------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Backend-код (.py)       | `backend/app/` (модели → `app/models/`, роутеры → `app/modules/`, core → `app/core/`) | создавать .py в корне                            |
| Frontend-код (.ts/.tsx) | `frontend/` (страницы → `app/`, компоненты → `components/`, утилиты → `lib/`)         | создавать .ts/.tsx в корне                       |
| Скрипты                 | `scripts/` (setup → `scripts/setup/`, деплой → `scripts/deployment/`)                 | создавать скрипты в корне                        |
| Документация (.md)      | `docs/` (гайды → `docs/guides/`, деплой → `docs/deployment/`, планы → `docs/планы/`)  | любой .md в корне, кроме README/CHANGELOG/AGENTS |
| Тесты backend           | `backend/tests/`                                                                      | —                                                |

**Перед созданием файла:** (1) он действительно нужен или достаточно обновить существующий? (2) файл в правильной папке? (3) нет дубликата? (4) имя не содержит запрещённых слов?

---

## 3. Категорически запрещено создавать (мусорные паттерны)

Эти файлы накапливались как мусор от прошлых сессий агентов (90+ устаревших файлов). **Не создавайте их.**

### В корне проекта

- `*_log*.txt`, `log.txt` — логи
- `tmp_*.txt`, `verify_*.txt` — временные файлы и результаты проверок
- `*_result*.md`, `*_RESULT*.md` — одноразовые результаты
- Любой `.md`, кроме `README.md` / `CHANGELOG.md` / `AGENTS.md`

### Где угодно в репозитории

- `*_SUMMARY.md`, `*_REPORT.md` — одноразовые сводки/отчёты → **вместо этого обновите `docs/STATUS.md`**
- `REORGANIZATION_*.md`, `CLEANUP_*.md`, `DIAGNOSTIC_*.md` — отчёты о чистке
- `TROUBLESHOOTING_*.md`, `RUN_LOCAL_NOW.md`, `*_FIX_SUMMARY.md`
- Файлы с копиями-номерами: `service (2).py`, `page (2).tsx`

**Вместо нового файла-отчёта** → обновите существующий `docs/STATUS.md` (убрать из «известных проблем» / добавить в «реализовано») и/или `docs/ROADMAP.md`.

---

## 4. Git — критические правила

### ⚠️ НИКОГДА не выполнять `git push` автоматически

Push в удалённый репозиторий — **ТОЛЬКО** после явного разрешения пользователя.
Процесс: выполнил задачу → `git add` → `git commit` → **ОСТАНОВИЛСЯ** → спросил «выполнить push?» → пуш только после явного ответа.

### Формат коммитов (Conventional Commits)

```
<type>(<scope>): <description>
```

- Типы: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`, `revert`
- Scopes: `backend`, `frontend`, `docs`, `project`, `deps` и др.
- Проверяется хуком commitlint (`commitlint.config.js`).

### Ветки

- `feature/<name>`, `fix/<name>`, `docs/<name>`, `refactor/<name>`
- PR только после `git rebase main`.
- В `main` пуш напрямую запрещён (branch protection) — только через PR.

### Что НЕ коммитить

`.env` (только `.env.example`), `__pycache__/`, `*.pyc`, `node_modules/`, `.next/`, логи (`*.log`, `*_log*.txt`), временные файлы (`tmp_*.txt`, `*.tmp`, `*.bak`), IDE-конфиги (`.vscode/`, `.idea/`), одноразовые отчёты/сводки, секреты (ключи/пароли).

---

## 5. Координация между разработчиками и агентами

В проекте могут одновременно работать **несколько разработчиков и ИИ-агентов** (ZCode, Cursor, Claude Code). Чтобы не ломать код друг друга:

1. **Перед началом задачи** — прочитайте `.hermes/COORDINATION.md`: не занята ли задача? кто над каким модулем работает? какие ветки активны?
2. **Заняли задачу** — отметьте это в COORDINATION.md (ветка + модули/файлы + статус).
3. **После задачи** — обновите COORDINATION.md + задетые документы, закоммитьте, попросите пользователя сделать push.
4. **Перед работой всегда** — `git pull`, чтобы видеть актуальное состояние.
5. **Спорные моменты** решает пользователь.

Миграции Alembic: перед созданием проверьте, что коллега не создаёт свою; номер — следующий свободный; при конфликте revision IDs — `alembic merge`.

Подробности и закреплённые владельцы модулей — в `.hermes/COORDINATION.md`.

---

## 6. Источники правды (когда документы противоречат друг другу)

1. `docs/STATUS.md` — что реально работает, миграции, проблемы
2. `docs/ROADMAP.md` — куда движемся
3. `CHANGELOG.md` — что и когда вышло (генерируется semantic-release)
4. `.hermes/COORDINATION.md` — координация и владение модулями
5. Всё остальное (`docs/guides/`, `docs/deployment/`) — справочное, может устаревать

---

## 7. Правила кодирования

### Python (Backend)

- Type hints везде; async/await для всех I/O; Pydantic для валидации; SQLAlchemy async ORM; PEP 8.
- Линтинг/форматирование: **ruff** (`ruff check .`, `ruff format .`) + **mypy**. Оба запускаются в CI.

### TypeScript/React (Frontend)

- Строгая типизация; функциональные компоненты с хуками; TailwindCSS; shadcn/ui.
- Линтинг/форматирование: **eslint** + **prettier** (конфиг `.prettierrc`).

### Именование

- Python: `snake_case` (`user_service.py`). TS-компоненты: PascalCase (`SearchForm.tsx`), утилиты: camelCase (`apiClient.ts`), хуки: `use`+PascalCase.
- Документация: UPPER_SNAKE_CASE (`GITHUB_ACTIONS.md`), без дат в имени (кроме `docs/changes/`, `docs/планы/`), без слов SUMMARY/REPORT/RESULT.

---

## 8. Запуск проверок локально

```bash
# Backend
cd backend && ruff check . && ruff format --check . && mypy app && PYTHONPATH=. pytest -q

# Frontend
cd frontend && npm run lint && npm run type-check

# Локальные git-хуки (Husky) проверяют staged-файлы автоматически при коммите
```
