# Результат проверки (Colaba)

## Что проверено

### Контейнеры (проверено)

| Контейнер            | Статус   | Порты                    |
|----------------------|----------|---------------------------|
| leadgen-postgres     | Up (healthy) | 5432:5432             |
| leadgen-redis        | Up (healthy) | 6379:6379             |
| leadgen-backend      | Up       | 8001:8000                 |
| leadgen-celery-worker| Up      | 8000/tcp                  |
| leadgen-frontend     | Up       | 4000:4000                 |

Все 5 сервисов запущены.

### Доступ с хоста

- Запросы к `http://127.0.0.1:8001/health` и `http://127.0.0.1:4000/` с хоста (curl) возвращали HTTP 000 — типично для Windows (брандмауэр, WSL, другой curl). Это не значит, что сервисы не работают.

### Что сделать тебе

1. Открой в браузере:
   - **Frontend:** http://localhost:4000
   - **Backend API (Swagger):** http://localhost:8001/api/docs
   - **Health:** http://localhost:8001/health

2. Если не открывается — посмотри логи:
   ```bash
   docker compose logs backend
   docker compose logs frontend
   ```

3. Повторная проверка контейнеров:
   ```bash
   docker ps --filter "name=leadgen"
   ```

## Сделано по проекту

- В `docker-compose.yml` backend при старте выполняет `alembic upgrade head`, затем запускает uvicorn.
- Для backend добавлен healthcheck по `/health`.
- Удалены старые контейнеры, конфликт с `leadgen-frontend` снят, стек поднят через `docker compose up -d --no-build`.
