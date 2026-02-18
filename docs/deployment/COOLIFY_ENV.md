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

**ОБЯЗАТЕЛЬНО оставь пустыми!** Миграции выполняет backend при старте (alembic upgrade head перед uvicorn).

**Важно:** Если там стоит `php artisan migrate` — удали. Это Laravel-команда, наш проект — FastAPI/Python. Такие команды ломают деплой.

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

## Gateway Timeout / белый экран

1. **Проверь Environment Variables** — `NEXT_PUBLIC_API_URL` и `CORS_ORIGINS` с правильными доменами.
2. **Подожди 1–2 минуты** после Redeploy — Next.js и backend могут стартовать не сразу.
3. **Проверь логи frontend:** `docker ps -a | grep frontend` → `docker logs <ID> --tail 50`
4. **Предупреждение "No health check"** в Coolify — можно игнорировать, healthcheck задан в docker-compose.

## 504 на frontend при работающем backend

Если `backend/health` открывается, а frontend по своему домену даёт 504:

### Причина

Прокси Coolify (Traefik) не получает ответ от frontend вовремя или маршрутизация указывает не на тот сервис/порт.

### Что проверить в Coolify

1. **Domains / Destinations**
   - Открой проект Colaba → вкладка **Domains** (или **Destinations** / **General**).
   - У frontend-домена `ck4g0000k4okkw8ck4sko0ok...` должен быть указан сервис **frontend** и порт **3000**.
   - У backend-домена `cgckw04gkk0g8g0g8gcwk44w...` — сервис **backend**, порт **8001**.

2. **Если frontend и backend — разные приложения**
   - У каждого приложения свои домены. Проверь, что домен frontend привязан именно к приложению с контейнером frontend.

3. **Таймаут Gateway (Traefik)**
   - Next.js может медленно отвечать при первом запросе.
   - В Coolify: Settings приложения или глобальные настройки → поиск «Timeout», «Read timeout», «Gateway timeout».
   - Увеличь до 120–180 секунд, если есть такая опция.

4. **Повторная привязка домена**
   - Удали домен frontend и добавь заново, указав сервис `frontend` и порт `3000`.
   - Сделай Redeploy.

### Проверка на сервере

```bash
# Frontend отвечает локально?
curl -I http://127.0.0.1:3000/

# Должно быть: HTTP/1.1 200 OK
```

Если `curl` даёт 200, значит контейнер работает, а 504 — из‑за настройки прокси/домена в Coolify.

## Traefik: увеличить таймаут (504 на первом запросе)

Next.js может долго отвечать при первом запросе (>60 сек). Traefik по умолчанию даёт 60 сек.

**Где:** Coolify → **Servers** → spinlid → **Proxy** → Command / Custom configuration

**Добавь в command:**
```
--entrypoints.https.transport.respondingTimeouts.readTimeout=5m
--entrypoints.http.transport.respondingTimeouts.readTimeout=5m
```

Перезапусти Proxy после изменений.

## Network isolation: прокси не видит контейнеры

Если compose использует кастомную сеть `leadgen-network`, Coolify-proxy может быть не подключён к ней.

**На сервере в терминале** (замени `leadgen-network` на имя сети из `docker network ls`, если другое):
```bash
docker network ls | grep leadgen
docker network connect leadgen-network-okkkosgk8ckk00g8goc8g4sk coolify-proxy
```

Имя сети часто: `<network>_<uuid>` — смотри в `docker network ls`.
