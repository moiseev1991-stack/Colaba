# Запустить локальный сервер сейчас

Актуальная инструкция (порты и команды соответствуют текущему `docker-compose.yml`).

## Вариант 1: Всё в Docker (один раз)

**Требования:** запущен Docker Desktop.

```powershell
cd E:\cod\Colaba
docker compose up -d
```

Подожди 1–2 минуты, затем открой:

| Сервис        | URL |
|---------------|-----|
| **Frontend**  | http://localhost:4000 |
| **Backend API** | http://localhost:8001 |
| **Swagger**   | http://localhost:8001/api/docs |

Регистрация/вход: http://localhost:4000/auth/register или /auth/login.

---

## Вариант 2: Скрипт

```powershell
cd E:\cod\Colaba
.\scripts\start.ps1
```

Тот же результат: поднимаются postgres, redis, backend, celery, frontend. Frontend — **http://localhost:4000**, Backend — **http://localhost:8001**.

---

## Вариант 3: Стили не работают в Docker — фронт локально

Если в Docker фронт отображается без стилей:

1. Поднять только backend-инфраструктуру и API:
   ```powershell
   cd E:\cod\Colaba
   docker compose up -d postgres redis backend celery-worker
   docker compose stop frontend
   ```

2. Запустить фронт локально:
   ```powershell
   cd E:\cod\Colaba\frontend
   npm install
   $env:NEXT_PUBLIC_API_URL="http://localhost:8001/api/v1"
   npm run dev
   ```

3. Открыть **http://localhost:4000** — стили и API работают.

---

## Проверка

```powershell
docker compose ps
```

Должны быть в статусе Up: leadgen-postgres, leadgen-redis, leadgen-backend, leadgen-celery-worker, leadgen-frontend.

Остановка: `docker compose down`.
