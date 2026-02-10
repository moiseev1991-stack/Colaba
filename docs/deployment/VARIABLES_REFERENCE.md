# Справочник переменных для CI/CD

Полный список переменных окружения и настроек, используемых в CI/CD pipeline.

## Переменные GitHub Actions (автоматические)

Эти переменные предоставляются автоматически GitHub Actions и не требуют настройки:

| Переменная | Описание | Использование |
|------------|----------|---------------|
| `GITHUB_TOKEN` | Токен для доступа к репозиторию и GHCR | Авторизация в GHCR, доступ к репозиторию |
| `GITHUB_ACTOR` | Имя пользователя, который запустил workflow | Авторизация в GHCR при push образов |
| `GITHUB_REPOSITORY` | Полное имя репозитория (owner/repo) | Формирование имен образов |
| `GITHUB_REPOSITORY_OWNER` | Владелец репозитория | Авторизация в GHCR при pull образов |
| `GITHUB_SHA` | SHA коммита | Формирование тегов образов |

## Переменные окружения для CI (`.github/workflows/ci.yml`)

### Backend Job

| Переменная | Значение по умолчанию | Описание |
|------------|----------------------|----------|
| `ENVIRONMENT` | `test` | Окружение для тестов |
| `DEBUG` | `False` | Режим отладки |
| `SECRET_KEY` | `ci-secret` | Секретный ключ для тестов |
| `DATABASE_URL` | `postgresql+asyncpg://leadgen_user:leadgen_password@localhost:5432/leadgen_db` | URL базы данных для тестов |
| `DATABASE_URL_SYNC` | `postgresql://leadgen_user:leadgen_password@localhost:5432/leadgen_db` | Синхронный URL БД |
| `REDIS_URL` | `redis://localhost:6379/0` | URL Redis |
| `CELERY_BROKER_URL` | `redis://localhost:6379/0` | URL брокера Celery |
| `CELERY_RESULT_BACKEND` | `redis://localhost:6379/0` | URL бэкенда результатов Celery |
| `CORS_ORIGINS` | `http://localhost:3000` | Разрешенные источники для CORS |
| `LOG_LEVEL` | `INFO` | Уровень логирования |

**Примечание:** Эти переменные задаются в workflow файле и не требуют настройки в GitHub Secrets.

## Переменные окружения для Deploy (сервер `/opt/colaba/.env`)

### Обязательные переменные

| Переменная | Пример | Описание |
|------------|--------|----------|
| `SECRET_KEY` | `your-super-secret-key-here` | Секретный ключ приложения (обязательно!) |
| `POSTGRES_USER` | `leadgen_user` | Пользователь PostgreSQL |
| `POSTGRES_PASSWORD` | `secure-password-123` | Пароль PostgreSQL (обязательно!) |
| `POSTGRES_DB` | `leadgen_db` | Имя базы данных |
| `DATABASE_URL` | `postgresql+asyncpg://user:pass@postgres:5432/db` | Async URL базы данных |
| `DATABASE_URL_SYNC` | `postgresql://user:pass@postgres:5432/db` | Синхронный URL БД |
| `REDIS_URL` | `redis://redis:6379/0` | URL Redis |
| `CELERY_BROKER_URL` | `redis://redis:6379/0` | URL брокера Celery |
| `CELERY_RESULT_BACKEND` | `redis://redis:6379/0` | URL бэкенда результатов Celery |
| `NEXT_PUBLIC_API_URL` | `https://your-domain.com/api/v1` | URL backend API для frontend (обязательно!) |
| `CORS_ORIGINS` | `https://your-domain.com` | Разрешенные источники для CORS (обязательно!) |

### Опциональные переменные

| Переменная | Значение по умолчанию | Описание |
|------------|----------------------|----------|
| `ENVIRONMENT` | `production` | Окружение |
| `DEBUG` | `False` | Режим отладки |
| `LOG_LEVEL` | `INFO` | Уровень логирования (DEBUG, INFO, WARNING, ERROR, CRITICAL) |
| `BACKEND_PORT` | `8000` | Порт backend |
| `FRONTEND_PORT` | `3000` | Порт frontend |
| `BACKEND_WORKERS` | `2` | Количество воркеров uvicorn |
| `CELERY_CONCURRENCY` | `2` | Параллелизм Celery worker |

### AI провайдеры (опционально)

| Переменная | Значение по умолчанию | Описание |
|------------|----------------------|----------|
| `OPENAI_API_KEY` | (пусто) | API ключ OpenAI |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | URL Ollama сервера |
| `OLLAMA_MODEL` | `llama2` | Модель Ollama |

### Яндекс XML API (опционально)

| Переменная | Значение по умолчанию | Описание |
|------------|----------------------|----------|
| `YANDEX_XML_FOLDER_ID` | (пусто) | ID каталога Яндекс Cloud |
| `YANDEX_XML_KEY` | (пусто) | API ключ сервисного аккаунта |

### Прокси (опционально)

| Переменная | Значение по умолчанию | Описание |
|------------|----------------------|----------|
| `USE_PROXY` | `false` | Использовать прокси |
| `PROXY_URL` | (пусто) | URL прокси сервера |
| `PROXY_LIST` | (пусто) | Список прокси (через запятую) |

## Переменные для Docker Compose (deploy.sh)

Эти переменные передаются в скрипт деплоя через GitHub Actions:

| Переменная | Источник | Описание |
|------------|----------|----------|
| `DEPLOY_PATH` | GitHub Actions env | Путь к директории деплоя (`/opt/colaba`) |
| `BACKEND_IMAGE` | Output из build_images job | Имя образа backend (`ghcr.io/owner/repo-backend`) |
| `FRONTEND_IMAGE` | Output из build_images job | Имя образа frontend (`ghcr.io/owner/repo-frontend`) |
| `IMAGE_TAG` | Output из build_images job | Тег образа (`sha-<commit_sha>`) |
| `GHCR_USER` | GitHub Actions env | Пользователь для авторизации в GHCR |
| `GHCR_TOKEN` | GitHub Actions env | Токен для авторизации в GHCR |
| `COMPOSE_FILE` | Скрипт deploy.sh | Файл docker-compose (`docker-compose.prod.yml`) |

## Формирование имен образов

Имена образов формируются автоматически в workflow:

```
REPO_NAME = "Colaba" (из GITHUB_REPOSITORY)
BACKEND_IMAGE = "ghcr.io/moiseev1991-stack/Colaba-backend"
FRONTEND_IMAGE = "ghcr.io/moiseev1991-stack/Colaba-frontend"
IMAGE_TAG = "sha-<commit_sha>" и "latest"
```

**Пример:**
- `ghcr.io/moiseev1991-stack/Colaba-backend:sha-abc123def456`
- `ghcr.io/moiseev1991-stack/Colaba-backend:latest`
- `ghcr.io/moiseev1991-stack/Colaba-frontend:sha-abc123def456`
- `ghcr.io/moiseev1991-stack/Colaba-frontend:latest`

## GitHub Secrets (не требуются)

В текущей конфигурации **не требуются** дополнительные GitHub Secrets, так как используются встроенные токены GitHub Actions (`GITHUB_TOKEN`).

Если в будущем понадобятся дополнительные secrets (например, для внешних сервисов), их можно добавить в:
**Settings → Secrets and variables → Actions → Secrets**

## GitHub Variables (опционально)

Можно настроить переменные в:
**Settings → Secrets and variables → Actions → Variables**

Примеры опциональных переменных:
- `BACKEND_PORT` - переопределение порта backend
- `FRONTEND_PORT` - переопределение порта frontend

## Проверка переменных

### На сервере:

```bash
# Проверка переменных в .env файле
cat /opt/colaba/.env

# Проверка переменных в контейнере
docker exec leadgen-backend env | grep -E "(SECRET_KEY|DATABASE_URL|NEXT_PUBLIC_API_URL)"
```

### В GitHub Actions:

Переменные можно проверить в логах workflow:
1. Перейдите в **Actions** → выберите workflow run
2. Откройте job → step
3. В логах будут видны используемые переменные

## Генерация секретных значений

### SECRET_KEY:

```bash
# Python
python -c "import secrets; print(secrets.token_urlsafe(32))"

# OpenSSL
openssl rand -base64 32
```

### POSTGRES_PASSWORD:

```bash
# Генерация надежного пароля
openssl rand -base64 24
```

## Безопасность

⚠️ **ВАЖНО:**

1. **Никогда не коммитьте** файл `.env` с реальными значениями
2. Используйте надежные пароли (минимум 16 символов)
3. Регулярно обновляйте `SECRET_KEY` в продакшене
4. Ограничьте доступ к файлу `.env` на сервере:
   ```bash
   chmod 600 /opt/colaba/.env
   chown deploy:deploy /opt/colaba/.env
   ```
5. Не используйте одинаковые пароли для разных окружений

## Примеры конфигураций

### Минимальная конфигурация (`.env`):

```env
SECRET_KEY=your-secret-key-here
POSTGRES_PASSWORD=your-postgres-password
NEXT_PUBLIC_API_URL=https://your-domain.com/api/v1
CORS_ORIGINS=https://your-domain.com
```

### Полная конфигурация:

См. файл `ENV_PRODUCTION.example` для полного примера со всеми опциональными переменными.
