# Локальная установка и запуск проекта Colaba

**Кратко:** см. [RUN_LOCAL_NOW.md](../RUN_LOCAL_NOW.md) — актуальные команды и порты.

## Предварительные требования

1. **Docker Desktop** — должен быть установлен и запущен
2. **Git** — для клонирования репозитория
3. **PowerShell** — для запуска скриптов

## Быстрый старт

### Шаг 1: Запустить Docker Desktop

Убедитесь, что Docker Desktop запущен:
```powershell
docker --version
```

### Шаг 2: Остановить старые контейнеры (если есть)

```powershell
docker ps -a
docker stop <container_id>
docker rm <container_id>
```

### Шаг 3: Запустить проект

**Вариант A: Скрипт (рекомендуется)**

```powershell
cd E:\cod\Colaba
.\scripts\start.ps1
```

Или с проверкой портов:
```powershell
cd E:\cod\Colaba
.\scripts\setup\start-docker-project.ps1
```

**Вариант B: Вручную**

```powershell
cd E:\cod\Colaba
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose down
docker compose up -d --build
```

## Проверка запуска

После запуска проверьте статус контейнеров:

```powershell
docker compose ps
```

Должны быть запущены:
- `leadgen-postgres` - PostgreSQL база данных
- `leadgen-redis` - Redis кеш и брокер сообщений
- `leadgen-backend` - Backend API (FastAPI)
- `leadgen-celery-worker` - Celery worker для фоновых задач
- `leadgen-frontend` - Frontend (Next.js)

## Доступ к сервисам

После успешного запуска (порты из текущего `docker-compose.yml`):

- **Frontend**: http://localhost:4000
- **Backend API**: http://localhost:8001
- **Swagger**: http://localhost:8001/api/docs
- **ReDoc**: http://localhost:8001/api/redoc

### Страницы настроек (после входа)

- **Провайдеры поиска**: http://localhost:4000/settings/providers — см. [PROVIDERS_SETTINGS.md](PROVIDERS_SETTINGS.md)
- **AI-ассистенты**: http://localhost:4000/settings/ai-assistants — см. [AI_ASSISTANTS.md](AI_ASSISTANTS.md)
- **Обход капчи**: http://localhost:4000/settings/captcha — см. [CAPTCHA_BYPASS.md](CAPTCHA_BYPASS.md)

Прокси для HTML-провайдеров (Яндекс, Google) можно задать в `/settings/providers` или через USE_PROXY, PROXY_URL, PROXY_LIST в `.env`.

## Полезные команды

### Просмотр логов

```powershell
# Все сервисы
docker compose logs -f

# Конкретный сервис
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres
```

### Остановка проекта

```powershell
docker compose down
```

### Перезапуск проекта

```powershell
docker compose restart
```

### Пересборка контейнеров

```powershell
docker compose up -d --build
```

### После изменений в коде — что делать с контейнерами

Код `backend/` и `frontend/` **монтируется** в контейнеры (`volumes: ./backend:/app`), поэтому файлы на диске и внутри контейнера — одни и те же.

| Что изменилось | Что делать |
|----------------|------------|
| **Только .py (backend)** | Ничего. Uvicorn с `--reload` сам подхватывает изменения. |
| **Только .ts, .tsx, .css (frontend)** | Ничего. Next.js `npm run dev` подхватывает. |
| **Код, который крутит Celery** (таски, очереди) | `docker compose restart celery-worker` |
| **requirements.txt** (новые/другие pip-пакеты) | `docker compose build backend` затем `docker compose up -d backend celery-worker` |
| **package.json** (новые npm-пакеты) | `docker compose build frontend` затем `docker compose up -d frontend` |
| **Dockerfile** (backend или frontend) | `docker compose build <backend или frontend>` затем `docker compose up -d <сервис>` |
| **docker-compose.yml** или **.env** | `docker compose up -d` (подхватит новые переменные) |

**Шпаргалка:**
- Правки в **.py** → сохранить → через 1–2 сек backend уже с новым кодом.
- Правки в **.ts/.tsx** → сохранить → frontend обновляется сам.
- Правки в **requirements.txt** → `docker compose build backend` → `docker compose up -d backend celery-worker`.
- Правки в **package.json** → `docker compose build frontend` → `docker compose up -d frontend`.

### Выполнение команд в контейнере

```powershell
# Backend контейнер
docker compose exec backend bash

# Frontend контейнер
docker compose exec frontend sh

# Выполнить миграции базы данных
docker compose exec backend alembic upgrade head
```

## Решение проблем

### Порт уже занят

Если порт занят:

```powershell
netstat -ano | findstr :4000
netstat -ano | findstr :8001
netstat -ano | findstr :5432
netstat -ano | findstr :6379
taskkill /PID <PID> /F
```

В `docker-compose.yml` фронт уже на **4000**, бэкенд на **8001** (внутри контейнера 8000).

### Контейнеры не запускаются

1. Проверьте логи:
   ```powershell
   docker compose logs
   ```

2. Проверьте, что Docker Desktop запущен

3. Пересоберите контейнеры:
   ```powershell
   docker compose down
   docker compose up -d --build
   ```

### База данных не подключается

1. Проверьте, что контейнер PostgreSQL запущен:
   ```powershell
   docker compose ps postgres
   ```

2. Проверьте логи PostgreSQL:
   ```powershell
   docker compose logs postgres
   ```

3. Пересоздайте базу данных (⚠️ удалит все данные):
   ```powershell
   docker compose down -v
   docker compose up -d
   ```

## Миграции базы данных

После первого запуска выполните миграции:

```powershell
docker compose exec backend alembic upgrade head
```

Или если запускаете локально (без Docker):

```powershell
cd backend
alembic upgrade head
```

## Остановка и очистка

### Остановить проект

```powershell
docker compose down
```

### Остановить и удалить volumes (удалит все данные БД)

```powershell
docker compose down -v
```

### Полная очистка (удалит контейнеры, volumes, сети)

```powershell
docker compose down -v --remove-orphans
docker system prune -a  # ⚠️ Удалит все неиспользуемые образы
```

## Структура проекта в Docker

```
Colaba/
├── docker-compose.yml     # Конфигурация всех сервисов
├── .env                   # Переменные окружения (создается из .env.example)
├── backend/               # Backend код (монтируется в контейнер)
└── frontend/              # Frontend код (монтируется в контейнер)
```

## Переменные окружения

Основные переменные в `.env`:

- `DATABASE_URL` - URL подключения к PostgreSQL
- `REDIS_URL` - URL подключения к Redis
- `SECRET_KEY` - Секретный ключ для JWT (измените в production!)
- `DEBUG` - Режим отладки (True/False)
- `CORS_ORIGINS` - Разрешенные источники для CORS

## Следующие шаги

1. ✅ Проект запущен
2. 📝 Выполнить миграции БД (если нужно)
3. 🔧 Настроить переменные окружения в `.env`
4. 🚀 Начать разработку!

---

**Проблемы?** Проверьте логи: `docker compose logs -f`
