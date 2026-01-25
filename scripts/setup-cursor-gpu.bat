@echo off
REM Скрипт для настройки использования дискретной видеокарты для Cursor
REM Требует запуска от имени администратора

echo === Настройка дискретной видеокарты для Cursor ===
echo.

REM Проверка прав администратора
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ВНИМАНИЕ: Скрипт требует прав администратора!
    echo Запустите этот файл от имени администратора (правой кнопкой - "Запуск от имени администратора")
    pause
    exit /b 1
)

echo Запуск PowerShell скрипта...
powershell.exe -ExecutionPolicy Bypass -File "%~dp0setup-cursor-gpu.ps1"

pause
