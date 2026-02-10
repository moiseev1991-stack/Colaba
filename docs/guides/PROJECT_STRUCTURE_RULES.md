# Правила структурирования проекта Colaba

## Версия: 1.0
## Дата: 22 января 2026

---

## 1. Общая структура проекта

Проект следует монорепозиторий структуре с четким разделением на backend и frontend:

```
Colaba/
├── backend/                    # Backend приложение (FastAPI)
│   ├── app/                    # Основной код приложения
│   ├── alembic/                # Миграции базы данных
│   ├── tests/                  # Тесты backend
│   ├── Dockerfile.dev          # Docker для разработки
│   ├── requirements.txt        # Python зависимости
│   └── README.md               # Документация backend
│
├── frontend/                   # Frontend приложение (Next.js)
│   ├── app/                    # Next.js App Router страницы
│   ├── components/             # React компоненты
│   ├── lib/                    # Утилиты и хелперы
│   ├── src/                    # Дополнительные исходники
│   ├── Dockerfile.dev          # Docker для разработки
│   ├── package.json            # Node.js зависимости
│   └── README.md               # Документация frontend
│
├── docs/                       # Документация проекта
│   ├── architecture/           # Архитектурные документы
│   ├── api/                    # API документация
│   ├── guides/                 # Руководства
│   └── deployment/             # Документация по развертыванию
│
├── scripts/                    # Скрипты для автоматизации
│   ├── setup/                  # Скрипты настройки
│   └── deployment/             # Скрипты развертывания
│
├── .github/                    # GitHub конфигурация (CI/CD)
│   └── workflows/              # GitHub Actions
│
├── docker-compose.yml          # Docker Compose конфигурация
├── .gitignore                  # Git ignore правила
├── .env.example                # Пример переменных окружения
└── README.md                   # Главный README проекта
```

---

## 2. Правила размещения файлов

### 2.1 Backend файлы

**Где размещать:**
- ✅ Все Python файлы → `backend/app/`
- ✅ Конфигурация Alembic → `backend/alembic/`
- ✅ Тесты → `backend/tests/`
- ✅ Dockerfile → `backend/Dockerfile.dev`
- ✅ requirements.txt → `backend/requirements.txt`

**Где НЕ размещать:**
- ❌ Python файлы в корне проекта
- ❌ Дублирующиеся файлы (__init__ (2).py, service (2).py и т.д.)
- ❌ Временные файлы (__pycache__, *.pyc)

**Импорты:**
```python
# ✅ ПРАВИЛЬНО: Импорты из app
from app.core.config import settings
from app.models.search import Search
from app.modules.searches.service import SearchService

# ❌ НЕПРАВИЛЬНО: Абсолютные пути или относительные из корня
from core.config import settings  # НЕПРАВИЛЬНО
```

### 2.2 Frontend файлы

**Где размещать:**
- ✅ Next.js страницы → `frontend/app/`
- ✅ React компоненты → `frontend/components/`
- ✅ Утилиты → `frontend/lib/`
- ✅ API клиенты → `frontend/src/services/api/`
- ✅ TypeScript конфигурация → `frontend/tsconfig.json`
- ✅ Next.js конфигурация → `frontend/next.config.js`

**Где НЕ размещать:**
- ❌ React компоненты в корне проекта
- ❌ TypeScript файлы в корне (кроме корневых конфигов)
- ❌ Дублирующиеся файлы (page (2).tsx, client.ts в корне)

**Импорты:**
```typescript
// ✅ ПРАВИЛЬНО: Относительные импорты из frontend/
import { Button } from '@/components/ui/button'
import { useSearch } from '@/lib/hooks/useSearch'
import { apiClient } from '@/src/services/api/client'

// ❌ НЕПРАВИЛЬНО: Импорты из корня
import { Button } from '../components/ui/button'  // Если файл в корне
```

### 2.3 Документация

**Где размещать:**
- ✅ Архитектурные документы → `docs/architecture/`
- ✅ API документация → `docs/api/`
- ✅ Руководства → `docs/guides/`
- ✅ Документация по развертыванию → `docs/deployment/`
- ✅ README для модулей → рядом с кодом модуля

**Файлы документации:**
- `ARCHITECTURE.md` → `docs/architecture/ARCHITECTURE.md`
- `API_REFERENCE.md` → `docs/api/API_REFERENCE.md`
- `DEPLOYMENT.md` → `docs/deployment/DEPLOYMENT.md`
- `MODULE_GUIDE.md` → `docs/guides/MODULE_GUIDE.md`
- `LEADGEN_RULES.md` → `docs/guides/LEADGEN_RULES.md`
- `GIT_SETUP_INSTRUCTIONS.md` → `docs/guides/GIT_SETUP_INSTRUCTIONS.md`

**Исключения (остаются в корне):**
- `README.md` - главный README проекта
- `.cursor/rules/project1.mdc` - правила Cursor AI

### 2.4 Конфигурационные файлы

**В корне проекта:**
- ✅ `docker-compose.yml` - Docker Compose конфигурация
- ✅ `.gitignore` - Git ignore правила
- ✅ `.env.example` - Пример переменных окружения
- ✅ `README.md` - Главный README

**В подпапках:**
- ✅ `backend/requirements.txt` - Python зависимости
- ✅ `backend/Dockerfile.dev` - Docker для backend
- ✅ `frontend/package.json` - Node.js зависимости
- ✅ `frontend/Dockerfile.dev` - Docker для frontend

### 2.5 Скрипты

**Где размещать:**
- ✅ Скрипты настройки → `scripts/setup/`
- ✅ Скрипты развертывания → `scripts/deployment/`
- ✅ Вспомогательные скрипты → `scripts/`

**Примеры:**
- `setup-cursor-powershell7.ps1` → `scripts/setup/setup-cursor-powershell7.ps1`
- `setup-mcp-filesystem.ps1` → `scripts/setup/setup-mcp-filesystem.ps1`
- `start.bat` → `scripts/start.bat`

---

## 3. Правила именования файлов

### 3.1 Python файлы

- ✅ Использовать snake_case: `user_service.py`, `database_config.py`
- ✅ Имена модулей должны быть понятными: `search_service.py`, не `ss.py`
- ❌ НЕ использовать дублирующиеся имена: `service.py`, `service (2).py`

### 3.2 TypeScript/React файлы

- ✅ Компоненты: PascalCase: `SearchForm.tsx`, `UserProfile.tsx`
- ✅ Утилиты: camelCase: `formatDate.ts`, `apiClient.ts`
- ✅ Хуки: camelCase с префиксом `use`: `useSearch.ts`, `useAuth.ts`
- ❌ НЕ использовать дублирующиеся имена: `page.tsx`, `page (2).tsx`

### 3.3 Документация

- ✅ Markdown файлы: UPPER_SNAKE_CASE для важных документов: `API_REFERENCE.md`
- ✅ Обычные документы: PascalCase: `Deployment.md`, `Architecture.md`
- ✅ README файлы: всегда `README.md`

---

## 4. Правила работы с Git

### 4.1 Коммиты

**Формат сообщений:**
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Типы:**
- `feat`: Новая функциональность
- `fix`: Исправление бага
- `docs`: Изменения в документации
- `refactor`: Рефакторинг кода
- `test`: Добавление тестов
- `chore`: Изменения в конфигурации, зависимостях
- `style`: Форматирование кода
- `perf`: Улучшение производительности

**Примеры:**
```
feat(backend): Add user authentication endpoint
fix(frontend): Fix search form validation
docs(project): Update deployment instructions
refactor(backend): Reorganize project structure
```

### 4.2 Ветки

**Формат имен:**
- `feature/<название>` - новая функциональность
- `fix/<название>` - исправление бага
- `docs/<название>` - изменения в документации
- `refactor/<название>` - рефакторинг
- `chore/<название>` - технические изменения

**Примеры:**
- `feature/user-authentication`
- `fix/search-validation`
- `docs/api-documentation`
- `refactor/project-structure`

### 4.3 Что НЕ коммитить

- ❌ `.env` файлы (только `.env.example`)
- ❌ `__pycache__/` и `*.pyc` файлы
- ❌ `node_modules/`
- ❌ `.next/` и другие build артефакты
- ❌ Временные файлы (`*.tmp`, `*.log`, `*.bak`)
- ❌ IDE конфигурация (`.vscode/`, `.idea/`)
- ❌ Личные заметки и черновики

---

## 5. Правила создания новых файлов

### 5.1 Перед созданием файла

1. **Проверить структуру проекта** - убедиться, что понимаешь, куда должен идти файл
2. **Проверить существующие файлы** - нет ли уже похожего функционала
3. **Следовать конвенциям** - именование, структура папок

### 5.2 Создание нового модуля

**Backend модуль:**
```
backend/app/modules/<module_name>/
├── __init__.py
├── router.py          # API endpoints
├── service.py         # Бизнес-логика
├── schemas.py         # Pydantic схемы
└── models.py          # SQLAlchemy модели (если нужны)
```

**Frontend компонент:**
```
frontend/components/<ComponentName>/
├── ComponentName.tsx
├── ComponentName.test.tsx
└── index.ts
```

### 5.3 Создание документации

- Новые документы → `docs/`
- Обновление существующих → обновить на месте
- Временные заметки → не коммитить в репозиторий

---

## 6. Чек-лист перед коммитом

- [ ] Файлы находятся в правильных папках
- [ ] Нет дублирующихся файлов
- [ ] Импорты корректны и работают
- [ ] Код следует конвенциям проекта
- [ ] Документация обновлена (если нужно)
- [ ] Тесты проходят (если есть)
- [ ] `.gitignore` настроен правильно
- [ ] Нет временных файлов в коммите

---

## 7. Миграция существующих файлов

### 7.1 Файлы для перемещения

**Из корня в backend/app/:**
- `main.py` → `backend/app/main.py` (если дубликат)
- `config.py` → `backend/app/core/config.py` (если дубликат)
- `database.py` → `backend/app/core/database.py` (если дубликат)
- `security.py` → `backend/app/core/security.py` (если дубликат)
- `tasks.py` → `backend/app/queue/tasks.py` (если дубликат)

**Из корня в frontend/:**
- `page.tsx` → `frontend/app/page.tsx` (если дубликат)
- `layout.tsx` → `frontend/app/layout.tsx` (если дубликат)
- `globals.css` → `frontend/app/globals.css` (если дубликат)
- `client.ts` → `frontend/src/services/api/client.ts` (если дубликат)

**Из корня в docs/:**
- `ARCHITECTURE.md` → `docs/architecture/ARCHITECTURE.md`
- `API_REFERENCE.md` → `docs/api/API_REFERENCE.md`
- `DEPLOYMENT.md` → `docs/deployment/DEPLOYMENT.md`
- `MODULE_GUIDE.md` → `docs/guides/MODULE_GUIDE.md`
- `LEADGEN_RULES.md` → `docs/guides/LEADGEN_RULES.md`
- `GIT_SETUP_INSTRUCTIONS.md` → `docs/guides/GIT_SETUP_INSTRUCTIONS.md`
- `IMPLEMENTATION_STATUS.md` → `docs/IMPLEMENTATION_STATUS.md`
- `TESTING_REPORT.md` → `docs/TESTING_REPORT.md`
- `STATUS.md` → `docs/STATUS.md`

**Из корня в scripts/:**
- `setup-*.ps1` → `scripts/setup/`
- `start.bat` → `scripts/start.bat`

### 7.2 Файлы для удаления

**Дублирующиеся файлы:**
- `__init__ (2).py`, `__init__ (3).py`, и т.д.
- `service (2).py`, `router (2).py`, и т.д.
- `page (2).tsx`, `README (2).md`, и т.д.

**Временные файлы:**
- `lastfailed`
- `nodeids`
- `stepwise`
- `CACHEDIR.TAG`
- `doc_2026-01-21_18-01-17.gitignore` (старые версии)

**Старые конфигурации:**
- `Dockerfile (2).dev`
- `doc_2026-01-21_18-01-17 (2).gitignore`

---

## 8. Обновление импортов после перемещения

После перемещения файлов необходимо обновить все импорты:

**Backend:**
```python
# Старый импорт (из корня)
from config import settings  # ❌

# Новый импорт (из backend/app/)
from app.core.config import settings  # ✅
```

**Frontend:**
```typescript
// Старый импорт (из корня)
import { Button } from './components/ui/button'  // ❌

// Новый импорт (из frontend/)
import { Button } from '@/components/ui/button'  // ✅
```

---

## 9. Проверка после реорганизации

После перемещения файлов проверить:

1. ✅ Все импорты работают
2. ✅ Приложение запускается
3. ✅ Тесты проходят
4. ✅ Docker контейнеры собираются
5. ✅ Нет ошибок в консоли

---

## 10. Исключения и особые случаи

### 10.1 Файлы, которые остаются в корне

- `README.md` - главный README проекта
- `docker-compose.yml` - общая конфигурация Docker
- `.gitignore` - правила Git
- `.env.example` - пример переменных окружения
- `.cursor/rules/` - правила Cursor AI

### 10.2 Символические ссылки

Если нужны символические ссылки для совместимости:
```bash
# Создать символическую ссылку (если необходимо)
ln -s backend/app app  # Linux/Mac
# или
mklink /D app backend\app  # Windows
```

**⚠️ ВНИМАНИЕ**: Символические ссылки могут вызвать проблемы в Git. Лучше обновить импорты.

---

## 11. Автоматизация

### 11.1 Скрипты для проверки структуры

Создать скрипт `scripts/check-structure.py` для проверки соответствия правилам:

```python
#!/usr/bin/env python3
"""Проверка структуры проекта согласно PROJECT_STRUCTURE_RULES.md"""

import os
from pathlib import Path

def check_structure():
    """Проверяет структуру проекта"""
    issues = []
    
    # Проверка дублирующихся файлов
    root = Path('.')
    for file in root.iterdir():
        if file.name.startswith('__init__ (') or file.name.endswith(' (2).py'):
            issues.append(f"Дублирующийся файл: {file.name}")
    
    # Проверка файлов backend в корне
    backend_files_in_root = ['main.py', 'config.py', 'database.py']
    for file in backend_files_in_root:
        if (root / file).exists() and (root / 'backend' / 'app' / file).exists():
            issues.append(f"Дубликат backend файла в корне: {file}")
    
    return issues

if __name__ == '__main__':
    issues = check_structure()
    if issues:
        print("Найдены проблемы со структурой:")
        for issue in issues:
            print(f"  - {issue}")
        exit(1)
    else:
        print("✅ Структура проекта соответствует правилам")
```

---

## 12. Контакты и вопросы

При возникновении вопросов по структуре проекта:
1. Проверить этот документ
2. Посмотреть примеры в существующем коде
3. Обсудить с командой перед внесением изменений

---

**Последнее обновление**: 22 января 2026
**Версия документа**: 1.0
