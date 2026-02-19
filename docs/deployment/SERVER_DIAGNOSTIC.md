# Диагностика на сервере — когда «ничего не работает»

Выполни эти команды **на сервере** (по SSH) в папке с проектом или где крутится Coolify.

## 1. Узнать ID контейнеров

```bash
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "frontend|backend|postgres|redis|celery"
```

## 2. Проверить, отвечают ли сервисы локально

```bash
# Frontend (должен 200)
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/

# Backend health
curl -s http://127.0.0.1:8001/health

# Backend (если порт 8001 — через docker)
curl -s http://127.0.0.1:8001/health
```

Если frontend не 200 или backend не отвечает — проблема в контейнерах.

## 3. Проверить сеть и proxy

**Подробно:** [PROXY_NETWORK_ISOLATION.md](./PROXY_NETWORK_ISOLATION.md)

```bash
# Сети
docker network ls | grep -E "leadgen|colaba|okkkosgk"

# Proxy подключен к сети приложения?
docker network inspect <имя_сети_приложения> --format '{{range .Containers}}{{.Name}} {{end}}'
# Должен быть coolify-proxy в списке

# Если нет — подключить
docker network connect <имя_сети> coolify-proxy
```

## 4. Логи (если что-то падает)

```bash
# Замени <frontend_id> и <backend_id> на ID из docker ps
docker logs <frontend_id> --tail 80
docker logs <backend_id> --tail 80
```

## 5. Environment Variables

В Coolify → Configuration → Environment Variables проверь:

| Переменная | Формат |
|------------|--------|
| CORS_ORIGINS | `http://твой-frontend-домен.88.210.53.183.sslip.io` (без слеша в конце) |
| NEXT_PUBLIC_API_URL | `http://твой-backend-домен.88.210.53.183.sslip.io/api/v1` |

**Важно:** `NEXT_PUBLIC_API_URL` задаётся при сборке frontend. Если менял — нужен **Redeploy**.

## 6. Domains в Coolify

- **Frontend-домен** → сервис `frontend`, порт **3000**
- **Backend-домен** → сервис `backend`, порт **8001**

Если порт backend указан 8000 — будет 502 (Coolify сам использует 8000).

## 7. Типичные симптомы

| Симптом | Причина | Решение |
|---------|---------|---------|
| 502 на frontend | Proxy не видит контейнер / таймаут | Подключить proxy к сети, увеличить readTimeout |
| 502 на backend | Неверный порт (8000 вместо 8001) | Domains → backend → порт 8001 |
| CORS в консоли | CORS_ORIGINS не совпадает с frontend URL | Исправить CORS_ORIGINS, Redeploy backend |
| API 404 / network error | NEXT_PUBLIC_API_URL неверный | Исправить, Redeploy frontend |
| Белый экран / «Загрузка...» | Hydration / ClientOnly | Ctrl+Shift+R, инкогнито; проверить консоль |
| Celery tasks не выполняются | Очередь / Redis | Логи celery-worker, redis ping |

## 8. Быстрая проверка после Redeploy

```bash
# Через 2–3 минуты после deploy
curl -I http://127.0.0.1:3000/
curl -s http://127.0.0.1:8001/health
```

Оба должны отвечать. Если да — проблема в Domains/Proxy, не в приложении.
