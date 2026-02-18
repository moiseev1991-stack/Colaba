# Environment Variables для Coolify

Скопируй эти переменные в Coolify → Environment Variables.
Оставь пустыми те, что помечены как optional, если не используешь.

## Обязательные

| Переменная | Пример | 
|------------|--------|
| SECRET_KEY | lv23lirOQsaPIJrzfpyo (или сгенерируй новый) |
| POSTGRES_USER | leadgen_user |
| POSTGRES_PASSWORD | leadgen_password |
| POSTGRES_DB | leadgen_db |
| DATABASE_URL | postgresql+asyncpg://leadgen_user:leadgen_password@postgres:5432/leadgen_db |
| DATABASE_URL_SYNC | postgresql://leadgen_user:leadgen_password@postgres:5432/leadgen_db |
| REDIS_URL | redis://redis:6379/0 |
| CELERY_BROKER_URL | redis://redis:6379/0 |
| CELERY_RESULT_BACKEND | redis://redis:6379/0 |
| CORS_ORIGINS | http://твой-домен-фронтенда.88.210.53.183.sslip.io |
| NEXT_PUBLIC_API_URL | http://твой-домен-бэкенда.88.210.53.183.sslip.io/api/v1 |
| LOG_LEVEL | INFO |

## Опциональные (оставь пустыми если не нужны)

| Переменная | Значение |
|------------|----------|
| OPENAI_API_KEY | (пусто) |
| OLLAMA_BASE_URL | http://localhost:11434 |
| OLLAMA_MODEL | llama2 |
| YANDEX_XML_FOLDER_ID | (пусто) |
| YANDEX_XML_KEY | (пусто) |
| USE_PROXY | false |
| PROXY_URL | (пусто) |
| PROXY_LIST | (пусто) |

## Pre/Post Deployment Commands

**Оставь пустыми.** Миграции выполняет backend при старте (alembic upgrade head перед uvicorn).

## Твои домены (пример)

- **Frontend:** `http://ck4g0000k4okkw8ck4sko0ok.88.210.53.183.sslip.io`
- **Backend:** `http://cgckw04gkk0g8g0g8gcwk44w.88.210.53.183.sslip.io`

В Environment Variables задай:
- **CORS_ORIGINS:** `http://ck4g0000k4okkw8ck4sko0ok.88.210.53.183.sslip.io`
- **NEXT_PUBLIC_API_URL:** `http://cgckw04gkk0g8g0g8gcwk44w.88.210.53.183.sslip.io/api/v1`

`NEXT_PUBLIC_API_URL` применяется при сборке — если менял, нужен Redeploy.

## Чек-лист перед Redeploy

1. **Configuration → General**
   - Base Directory: пусто (если compose в корне)
   - Docker Compose Location: `docker-compose.prod.yml`

2. **Configuration → Environment Variables**
   - Все обязательные переменные заполнены
   - В `DATABASE_URL` и `DATABASE_URL_SYNC` хост = `postgres` (не localhost)

3. **Configuration → Advanced → Pre/Post Deployment**
   - Pre-deployment: Command и Container Name — пусто
   - Post-deployment: Command и Container Name — пусто

4. **Configuration → Ports**
   - Backend: 8001 (8000 занят Coolify), Frontend: 3000

5. **Перед Redeploy** — сохрани все изменения (Save)

## Если backend не стартует — смотреть логи

На сервере в терминале:
```bash
docker ps -a | grep backend-okkkosgk8ckk00g8goc8g4sk
docker logs <ID_контейнера_backend>
```
