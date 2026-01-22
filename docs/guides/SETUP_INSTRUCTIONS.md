# Инструкция по запуску проекта LeadGen Constructor

## ✅ Что уже сделано

1. ✅ Создана структура директорий `app/` с поддиректориями:
   - `app/core/` - конфигурация, база данных, безопасность
   - `app/models/` - модели БД
   - `app/modules/` - модули (searches, filters)
   - `app/api/` - API роутеры
   - `app/queue/` - Celery задачи

2. ✅ Файлы организованы в правильную структуру
3. ✅ Создан файл `.env` с настройками (но он заблокирован .gitignore)
4. ✅ Созданы директории `backend/` и `frontend/` для Docker

## 📋 Что нужно установить

### Вариант 1: Запуск через Docker (рекомендуется)

**Требования:**
- Docker Desktop должен быть запущен
- Docker Compose установлен (входит в Docker Desktop)

**Шаги:**

1. **Запустите Docker Desktop** (если еще не запущен)

2. **Создайте файл `.env` в корне проекта** (если его нет):
```env
# Application
ENVIRONMENT=development
DEBUG=True
SECRET_KEY=dev-secret-key-change-in-production-please-use-random-string
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Database
DATABASE_URL=postgresql+asyncpg://leadgen_user:leadgen_password@postgres:5432/leadgen_db
DATABASE_URL_SYNC=postgresql://leadgen_user:leadgen_password@postgres:5432/leadgen_db

# Redis
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0

# CORS
CORS_ORIGINS=http://localhost:3000

# LLM (optional)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2
OPENAI_API_KEY=

# External APIs (optional)
SERPAPI_KEY=

# Logging
LOG_LEVEL=INFO
```

3. **Запустите проект:**
```bash
# Windows
.\start.bat

# Или вручную
docker-compose up -d
```

4. **Проверьте статус:**
```bash
docker-compose ps
```

5. **Проверьте логи (если что-то не работает):**
```bash
docker-compose logs backend
docker-compose logs frontend
docker-compose logs celery-worker
```

### Вариант 2: Локальный запуск (без Docker)

**Требования:**
- Python 3.11+ (установлен: Python 3.14.2 ✅)
- Node.js 18+ (установлен: v24.13.0 ✅)
- PostgreSQL 16 (нужно установить локально)
- Redis (нужно установить локально)

**Шаги:**

1. **Установите PostgreSQL и Redis локально:**
   - PostgreSQL: https://www.postgresql.org/download/windows/
   - Redis: https://redis.io/download (или используйте WSL)

2. **Создайте базу данных:**
```sql
CREATE DATABASE leadgen_db;
CREATE USER leadgen_user WITH PASSWORD 'leadgen_password';
GRANT ALL PRIVILEGES ON DATABASE leadgen_db TO leadgen_user;
```

3. **Создайте виртуальное окружение Python:**
```bash
python -m venv venv
venv\Scripts\activate
```

4. **Установите зависимости Python:**
```bash
# Проблема с psycopg2-binary на Windows - попробуйте:
pip install --upgrade pip
pip install psycopg2-binary --only-binary :all:

# Или установите все зависимости кроме psycopg2-binary, затем:
pip install -r requirements.txt
```

5. **Запустите миграции:**
```bash
alembic upgrade head
```

6. **Запустите backend:**
```bash
uvicorn app.main:app --reload
```

7. **В другом терминале запустите Celery worker:**
```bash
celery -A app.queue.celery_app worker --loglevel=info
```

8. **В третьем терминале установите зависимости frontend и запустите:**
```bash
npm install
npm run dev
```

## 🔗 URL сервисов

После запуска:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs (Swagger)**: http://localhost:8000/api/docs
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

## ⚠️ Известные проблемы

1. **psycopg2-binary на Windows**: Может не установиться из-за отсутствия компилятора. Решение:
   - Используйте Docker (рекомендуется)
   - Или установите Visual C++ Build Tools
   - Или используйте WSL

2. **Docker Desktop не запущен**: Убедитесь, что Docker Desktop запущен перед использованием `docker-compose`

3. **Порты заняты**: Если порты 3000, 8000, 5432, 6379 заняты, измените их в `docker-compose.yml`

## 📝 Следующие шаги

1. Запустите Docker Desktop
2. Выполните `.\start.bat` или `docker-compose up -d`
3. Дождитесь запуска всех сервисов
4. Откройте http://localhost:3000 в браузере

## 🆘 Если что-то не работает

1. Проверьте логи: `docker-compose logs [service_name]`
2. Проверьте статус: `docker-compose ps`
3. Пересоберите контейнеры: `docker-compose build --no-cache`
4. Остановите все: `docker-compose down`
5. Запустите заново: `docker-compose up -d`
