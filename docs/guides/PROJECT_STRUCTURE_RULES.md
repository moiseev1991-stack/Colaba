# Правила структурирования проекта Colaba

## Версия: 2.0 | Дата: 18 марта 2026

---

## 1. Общая структура

```
colaba2402/
├── backend/                    # FastAPI backend
│   ├── app/                    # Основной код
│   │   ├── admin/              # SQLAdmin views
│   │   ├── core/               # Конфигурация, БД, безопасность
│   │   ├── models/             # SQLAlchemy модели
│   │   ├── modules/            # Бизнес-модули (auth, searches, etc.)
│   │   └── main.py             # Точка входа
│   ├── alembic/                # Миграции
│   ├── tests/                  # Тесты
│   ├── requirements.txt        # Зависимости
│   └── Dockerfile.dev          # Docker для разработки
│
├── frontend/                   # Next.js frontend
│   ├── app/                    # App Router страницы
│   ├── components/             # React компоненты
│   ├── lib/                    # Утилиты и хелперы
│   ├── src/                    # Дополнительные исходники
│   ├── package.json            # Зависимости
│   └── Dockerfile.dev          # Docker для разработки
│
├── docs/                       # Вся документация
│   ├── STATUS.md               # Статус проекта
│   ├── ROADMAP.md              # Дорожная карта
│   ├── README.md               # Индекс документации
│   ├── changes/                # Журнал изменений
│   ├── deployment/             # Deployment документация
│   ├── guides/                 # Руководства
│   └── планы/                  # Планы и аудиты
│
├── scripts/                    # Скрипты
│   ├── setup/                  # Скрипты настройки
│   └── deployment/             # Скрипты развертывания
│
├── .github/workflows/          # CI/CD
├── docker-compose.yml          # Dev Docker
├── docker-compose.prod.yml     # Prod Docker
└── .gitignore
```

---

## 2. Правила размещения файлов

### Backend
- Код -- `backend/app/`
- Модели -- `backend/app/models/`
- Роутеры и сервисы -- `backend/app/modules/<module>/`
- Админка -- `backend/app/admin/views/`
- Миграции -- `backend/alembic/versions/`
- Тесты -- `backend/tests/`

### Frontend
- Страницы -- `frontend/app/`
- Компоненты -- `frontend/components/`
- Утилиты -- `frontend/lib/`
- API клиенты -- `frontend/src/services/api/`

### Документация
- Руководства -- `docs/guides/`
- Deployment -- `docs/deployment/`
- Планы -- `docs/планы/`
- Изменения -- `docs/changes/`
- Статус -- `docs/STATUS.md`
- Дорожная карта -- `docs/ROADMAP.md`

### Скрипты
- Настройка -- `scripts/setup/`
- Деплой -- `scripts/deployment/`

---

## 3. Именование файлов

### Код
- Python: `snake_case` -- `user_service.py`, `search_router.py`
- React компоненты: `PascalCase` -- `SearchForm.tsx`
- Хуки: `use` + PascalCase -- `useSearch.ts`
- Утилиты: `camelCase` -- `apiClient.ts`

### Документация
- `UPPER_SNAKE_CASE` -- `GITHUB_ACTIONS.md`
- Без дат (кроме `docs/changes/` и `docs/планы/`)
- Без слов: SUMMARY, REPORT, RESULT, FIX

---

## 4. Запрещённые файлы

Не создавать в репозитории:
- Лог-файлы: `*_log*.txt`, `log.txt`
- Временные файлы: `tmp_*.txt`, `*.tmp`
- Результаты проверок: `verify_*.txt`, `*_result*.md`
- Одноразовые отчёты: `*_SUMMARY.md`, `*_REPORT.md`
- Исторические записи: `REORGANIZATION_*.md`, `CLEANUP_*.md`

Вместо одноразовых файлов -- обновлять существующие (`docs/STATUS.md`, `docs/ROADMAP.md`).

---

## 5. Создание нового модуля

### Backend
```
backend/app/modules/<module_name>/
├── __init__.py
├── router.py
├── service.py
├── schemas.py
└── models.py (если нужны новые модели)
```

### Frontend
```
frontend/components/<ComponentName>/
├── ComponentName.tsx
└── index.ts
```

---

## 6. Git коммиты

Формат: `<type>(<scope>): <description>`

Типы: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `style`, `perf`, `ci`, `build`

Примеры:
- `feat(backend): Add OAuth authorization`
- `fix(frontend): Fix search form validation`
- `docs(deployment): Update Coolify guide`
