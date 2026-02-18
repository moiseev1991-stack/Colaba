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
