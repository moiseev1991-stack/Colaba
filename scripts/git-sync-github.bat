@echo off
cd /d "%~dp0.."
echo Repository: %CD%
echo.
echo Remote:
git remote -v
echo.
echo Fetching from origin...
git fetch origin
if errorlevel 1 (echo Fetch failed. & pause & exit /b 1)
echo.
echo Pulling main...
git pull origin main
echo.
echo Status:
git status
echo.
echo Done.
pause
