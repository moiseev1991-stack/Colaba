# Frontend: CSS в Docker

## Проблема
Next.js dev в Docker отдаёт битый HTML (RSC stream вместо полного документа), из‑за чего CSS не загружается.

## Решение: запускать фронтенд локально

```powershell
# 1. Backend в Docker
docker compose up -d postgres redis backend celery-worker

# 2. Остановить Docker-фронт и запустить локально
docker compose stop frontend
cd frontend && npm run dev
```

Или: `.\scripts\start-frontend.ps1` (после `docker compose stop frontend`)

Сайт: http://localhost:4000 — CSS работает.

## Если нужен фронт в Docker
`docker compose up -d` — фронт поднимется, но стили могут не применяться.
