@echo off
echo ========================================
echo LeadGen Constructor - Starting Services
echo ========================================
echo.

REM Check if Docker is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not running. Please start Docker Desktop.
    pause
    exit /b 1
)

echo [INFO] Docker is running.
echo.

REM Start services
echo [INFO] Starting PostgreSQL and Redis...
docker-compose up -d postgres redis

echo [INFO] Waiting for database to be ready...
timeout /t 5 /nobreak >nul

echo [INFO] Starting Backend and Celery Worker...
docker-compose up -d backend celery-worker

echo [INFO] Waiting for backend to be ready...
timeout /t 10 /nobreak >nul

echo [INFO] Starting Frontend...
docker-compose up -d frontend

echo.
echo ========================================
echo Services Status:
echo ========================================
docker-compose ps

echo.
echo ========================================
echo Services URLs:
echo ========================================
echo Frontend:  http://localhost:3000
echo Backend:   http://localhost:8000
echo API Docs:  http://localhost:8000/docs
echo PostgreSQL: localhost:5432
echo Redis:     localhost:6379
echo ========================================
echo.
echo To view logs: docker-compose logs -f [service_name]
echo To stop:     docker-compose down
echo.

pause
