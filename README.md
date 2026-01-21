# LeadGen Constructor Backend

Backend API для модульной платформы автоматического сбора лидов и анализа данных.

## Технологии

- **FastAPI 0.104+**: Async web framework
- **Python 3.11+**: Async/await, type hints
- **SQLAlchemy 2.0+**: Async ORM
- **Alembic**: Database migrations
- **PostgreSQL 16**: База данных
- **Redis**: Кеш и message broker для Celery
- **Celery 5.3+**: Distributed task queue

## Установка

### 1. Создать виртуальное окружение

```bash
python -m venv venv
source venv/bin/activate  # Linux/Mac
# или
venv\Scripts\activate  # Windows
```

### 2. Установить зависимости

```bash
pip install -r requirements.txt
```

### 3. Настроить environment variables

Скопировать `.env.example` в `.env` и заполнить значения:

```bash
cp .env.example .env
# Редактировать .env файл
```

### 4. Запустить PostgreSQL и Redis

Через Docker Compose (см. `docker-compose.yml`) или локально.

### 5. Запустить миграции Alembic

```bash
alembic upgrade head
```

### 6. Запустить сервер

```bash
python -m app.main
# или
uvicorn app.main:app --reload
```

## Структура проекта

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                      # FastAPI приложение
│   │
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py                # Configuration
│   │   ├── security.py              # JWT, password hashing
│   │   ├── database.py              # DB session
│   │   └── dependencies.py          # FastAPI dependencies
│   │
│   ├── modules/                     # Модули (Search, Filter, Analytics)
│   │   ├── __init__.py
│   │   ├── base.py                  # Abstract base class
│   │   └── ...
│   │
│   ├── models/                      # SQLAlchemy models
│   │   ├── __init__.py
│   │   └── ...
│   │
│   ├── schemas/                     # Pydantic schemas
│   │   ├── __init__.py
│   │   └── ...
│   │
│   ├── api/                         # API routers
│   │   ├── __init__.py
│   │   └── ...
│   │
│   └── services/                    # Business logic services
│       ├── __init__.py
│       └── ...
│
├── tests/                           # Тесты
│   ├── conftest.py
│   └── ...
│
├── alembic/                         # Database migrations
│   ├── env.py
│   └── versions/
│
├── .env.example                     # Пример .env файла
├── requirements.txt                 # Python dependencies
└── README.md                        # Этот файл
```

## Разработка

### Запуск тестов

```bash
pytest
# С coverage
pytest --cov=app --cov-report=html
```

### Форматирование кода

```bash
black app/
isort app/
```

### Type checking

```bash
mypy app/
```

### Линтинг

```bash
flake8 app/
```

## API документация

После запуска сервера:

- **Swagger UI**: http://localhost:8000/api/docs
- **ReDoc**: http://localhost:8000/api/redoc

## Health checks

- `/health` - Health check endpoint
- `/ready` - Readiness check endpoint
- `/api/v1/health` - API health check
