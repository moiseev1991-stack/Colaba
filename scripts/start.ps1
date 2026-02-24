# Простой скрипт запуска проекта Colaba
# Запуск: .\start.ps1

Write-Host "=== Запуск проекта Colaba ===" -ForegroundColor Green

# Проверка Docker
Write-Host "`nПроверка Docker..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ $dockerVersion" -ForegroundColor Green
    } else {
        Write-Host "✗ Docker не запущен. Запустите Docker Desktop и попробуйте снова." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Docker не найден. Установите Docker Desktop." -ForegroundColor Red
    exit 1
}

# Остановка старых контейнеров проекта
Write-Host "`nОстановка старых контейнеров проекта..." -ForegroundColor Yellow
docker compose down 2>&1 | Out-Null

# Создание .env если его нет
if (-not (Test-Path ".env")) {
    Write-Host "Создание .env файла..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "✓ .env создан" -ForegroundColor Green
}

# Запуск проекта
Write-Host "`nЗапуск проекта..." -ForegroundColor Yellow
Write-Host "Это может занять несколько минут при первом запуске..." -ForegroundColor Cyan

docker compose up -d --build

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✓ Проект запущен!" -ForegroundColor Green
    Write-Host "`nДоступные сервисы:" -ForegroundColor Cyan
    Write-Host "  Frontend:  http://localhost:4000" -ForegroundColor White
    Write-Host "  Backend:   http://localhost:8001" -ForegroundColor White
    Write-Host "  API Docs:  http://localhost:8001/api/docs" -ForegroundColor White
    Write-Host "`nПросмотр логов: docker compose logs -f" -ForegroundColor Yellow
    Write-Host "Остановка:     docker compose down" -ForegroundColor Yellow
} else {
    Write-Host "`n✗ Ошибка при запуске" -ForegroundColor Red
    Write-Host "Проверьте логи: docker compose logs" -ForegroundColor Yellow
}
