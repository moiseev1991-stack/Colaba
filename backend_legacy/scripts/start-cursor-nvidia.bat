@echo off
chcp 65001 >nul
set CURSOR="%LOCALAPPDATA%\Programs\cursor\Cursor.exe"
if not exist %CURSOR% (echo Cursor не найден: %CURSOR% & pause & exit /b 1)

:: Сначала применить настройки GPU
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-cursor-gpu.ps1"

:: Запуск Cursor с флагами для предпочтения дискретного GPU (Electron/Chromium)
start "" %CURSOR% --use-gl=desktop --ignore-gpu-blocklist
