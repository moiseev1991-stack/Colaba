@echo off
echo ========================================
echo   Colaba - Frontend локально (без Docker)
echo ========================================
echo.

echo [1] Проверка Docker-сервисов (backend, postgres, redis)...
docker compose ps backend 2>nul | findstr "Up" >nul
if errorlevel 1 (
    echo Backend не запущен. Запускаю: docker compose up -d postgres redis backend celery-worker
    docker compose up -d postgres redis backend celery-worker
    echo Ждём 30 сек...
    timeout /t 30 /nobreak >nul
) else (
    echo Backend уже запущен.
)
echo.

echo [2] Запуск frontend (npm run dev)...
cd frontend
if not exist .env.local (
    echo Создаю .env.local из .env.local.example
    copy .env.local.example .env.local
)
echo.
echo Frontend: http://localhost:4000
echo Backend:  http://localhost:8001
echo.
npm run dev
