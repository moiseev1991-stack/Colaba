# План наведения порядка в проекте Colaba

## Цель
Организовать файлы проекта согласно `PROJECT_STRUCTURE_RULES.md` без нарушения работоспособности кода.

## Этапы выполнения

### Этап 1: Создание структуры папок ✅
- [x] Создать `docs/` и подпапки
- [x] Создать `scripts/` и подпапки
- [x] Проверить существующие папки `backend/` и `frontend/`

### Этап 2: Организация документации
- [ ] Переместить документацию в `docs/`
- [ ] Обновить ссылки в документах (если есть)
- [ ] Удалить дублирующиеся README файлы

### Этап 3: Очистка корня проекта
- [ ] Переместить backend файлы из корня (если они дубликаты)
- [ ] Переместить frontend файлы из корня (если они дубликаты)
- [ ] Удалить дублирующиеся файлы
- [ ] Удалить временные файлы

### Этап 4: Организация скриптов
- [ ] Переместить скрипты в `scripts/`
- [ ] Обновить пути в скриптах (если нужно)

### Этап 5: Проверка работоспособности
- [ ] Проверить импорты в backend
- [ ] Проверить импорты в frontend
- [ ] Проверить запуск приложения
- [ ] Проверить сборку Docker

### Этап 6: Коммит изменений
- [ ] Добавить изменения в Git
- [ ] Создать коммит с описанием реорганизации
- [ ] Отправить в репозиторий

## Файлы для перемещения

### Документация → docs/
- `ARCHITECTURE.md` → `docs/architecture/ARCHITECTURE.md`
- `API_REFERENCE.md` → `docs/api/API_REFERENCE.md`
- `DEPLOYMENT.md` → `docs/deployment/DEPLOYMENT.md`
- `MODULE_GUIDE.md` → `docs/guides/MODULE_GUIDE.md`
- `LEADGEN_RULES.md` → `docs/guides/LEADGEN_RULES.md`
- `GIT_SETUP_INSTRUCTIONS.md` → `docs/guides/GIT_SETUP_INSTRUCTIONS.md`
- `IMPLEMENTATION_STATUS.md` → `docs/IMPLEMENTATION_STATUS.md`
- `TESTING_REPORT.md` → `docs/TESTING_REPORT.md`
- `STATUS.md` → `docs/STATUS.md`
- `FRONTEND_FIX_SUMMARY.md` → `docs/FRONTEND_FIX_SUMMARY.md`
- `SETUP_INSTRUCTIONS.md` → `docs/guides/SETUP_INSTRUCTIONS.md`

### Скрипты → scripts/
- `setup-cursor-powershell7.ps1` → `scripts/setup/setup-cursor-powershell7.ps1`
- `setup-mcp-filesystem.ps1` → `scripts/setup/setup-mcp-filesystem.ps1`
- `start.bat` → `scripts/start.bat`

## Файлы для удаления

### Дублирующиеся файлы
- `__init__ (2).py` до `__init__ (6).py`
- `service (2).py`
- `router (2).py`
- `schemas (2).py`
- `page (2).tsx`
- `README (2).md`, `README (3).md`
- `Dockerfile (2).dev`

### Временные файлы
- `lastfailed`
- `nodeids`
- `stepwise`
- `CACHEDIR.TAG`
- `doc_2026-01-21_18-01-17.gitignore`
- `doc_2026-01-21_18-01-17 (2).gitignore`

## Файлы для проверки (возможно дубликаты)

### Backend файлы в корне (проверить перед удалением)
- `main.py` - проверить, не используется ли
- `config.py` - проверить, не используется ли
- `database.py` - проверить, не используется ли
- `dependencies.py` - проверить, не используется ли
- `security.py` - проверить, не используется ли
- `tasks.py` - проверить, не используется ли
- `celery_app.py` - проверить, не используется ли
- `blacklist.py`, `crawler.py`, `outreach.py`, `filter.py`, `search.py`, `serpapi.py`, `service.py` - проверить

### Frontend файлы в корне (проверить перед удалением)
- `page.tsx`, `layout.tsx`, `globals.css` - проверить, не используются ли
- `client.ts`, `search.ts` - проверить, не используются ли
- `SearchForm.tsx`, `Providers.tsx` - проверить, не используются ли
- `next.config.js`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js` - проверить дубликаты

## Важные замечания

1. **Не удалять файлы сразу** - сначала проверить, используются ли они
2. **Обновить импорты** - после перемещения файлов обновить все импорты
3. **Проверить работоспособность** - после каждого этапа проверять, что код работает
4. **Делать коммиты** - коммитить изменения по этапам для возможности отката
