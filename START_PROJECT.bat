@echo off
echo ========================================
echo   Colaba - Start Project
echo ========================================
echo.

echo [1] Stopping old containers...
docker compose down 2>nul
echo.

echo [2] Building and starting (first run ~5-10 min)...
docker compose up -d --build
if errorlevel 1 (
    echo.
    echo ERROR: Docker failed. Try:
    echo   1. Restart Docker Desktop (right-click tray icon - Restart)
    echo   2. Run this script again
    pause
    exit /b 1
)

echo.
echo [3] Waiting 45 sec for services to start...
timeout /t 45 /nobreak >nul

echo.
echo [4] Checking...
docker ps --filter "name=leadgen" --format "  {{.Names}} - {{.Status}}"
echo.
echo ========================================
echo   DONE. Open in browser:
echo   Frontend:  http://localhost:4000
echo   Backend:   http://localhost:8001/api/docs
echo ========================================
pause
