# Скрипт для запуска проекта Colaba в Docker
# Использование: .\scripts\setup\start-docker-project.ps1

Write-Host "=== Запуск проекта Colaba ===" -ForegroundColor Green

# Проверка Docker
Write-Host "`n[1/5] Проверка Docker..." -ForegroundColor Yellow
try {
    docker --version | Out-Null
    Write-Host "✓ Docker установлен" -ForegroundColor Green
} catch {
    Write-Host "✗ Docker не найден. Установите Docker Desktop." -ForegroundColor Red
    exit 1
}

# Проверка Docker Compose
Write-Host "`n[2/5] Проверка Docker Compose..." -ForegroundColor Yellow
try {
    docker compose version | Out-Null
    Write-Host "✓ Docker Compose доступен" -ForegroundColor Green
} catch {
    Write-Host "✗ Docker Compose не найден." -ForegroundColor Red
    exit 1
}

# Остановка и удаление старых контейнеров проекта (если есть)
Write-Host "`n[3/5] Остановка старых контейнеров проекта..." -ForegroundColor Yellow
$oldContainers = @("leadgen-postgres", "leadgen-redis", "leadgen-backend", "leadgen-celery-worker", "leadgen-frontend")
foreach ($container in $oldContainers) {
    $exists = docker ps -a --filter "name=$container" --format "{{.Names}}" 2>$null
    if ($exists -eq $container) {
        Write-Host "  Останавливаю контейнер: $container" -ForegroundColor Cyan
        docker stop $container 2>$null | Out-Null
        docker rm $container 2>$null | Out-Null
        Write-Host "  ✓ Контейнер $container удален" -ForegroundColor Green
    }
}

# Проверка занятых портов
Write-Host "`n[4/5] Проверка портов..." -ForegroundColor Yellow
$ports = @(5432, 6379, 8000, 3000)
$conflicts = @()
foreach ($port in $ports) {
    $listener = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($listener) {
        $conflicts += $port
        Write-Host "  ⚠ Порт $port занят" -ForegroundColor Yellow
    } else {
        Write-Host "  ✓ Порт $port свободен" -ForegroundColor Green
    }
}

if ($conflicts.Count -gt 0) {
    Write-Host "`n⚠ ВНИМАНИЕ: Следующие порты заняты: $($conflicts -join ', ')" -ForegroundColor Yellow
    Write-Host "  Это могут быть старые контейнеры. Попробуйте остановить их:" -ForegroundColor Yellow
    Write-Host "  docker ps -a" -ForegroundColor Cyan
    Write-Host "  docker stop <container_id>" -ForegroundColor Cyan
    $continue = Read-Host "  Продолжить запуск? (y/n)"
    if ($continue -ne "y") {
        exit 0
    }
}

# Создание .env файла если его нет
Write-Host "`n[5/5] Проверка .env файла..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    Write-Host "  Создаю .env из .env.example..." -ForegroundColor Cyan
    Copy-Item ".env.example" ".env"
    Write-Host "  ✓ .env файл создан" -ForegroundColor Green
} else {
    Write-Host "  ✓ .env файл существует" -ForegroundColor Green
}

# Запуск проекта
Write-Host "`n=== Запуск Docker Compose ===" -ForegroundColor Green
Write-Host "Собираю и запускаю контейнеры..." -ForegroundColor Yellow

docker compose up -d --build

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✓ Проект успешно запущен!" -ForegroundColor Green
    Write-Host "`nДоступные сервисы:" -ForegroundColor Cyan
    Write-Host "  - Backend API: http://localhost:8000" -ForegroundColor White
    Write-Host "  - Frontend: http://localhost:3000" -ForegroundColor White
    Write-Host "  - API Docs: http://localhost:8000/api/docs" -ForegroundColor White
    Write-Host "`nПолезные команды:" -ForegroundColor Cyan
    Write-Host "  docker compose ps          - статус контейнеров" -ForegroundColor White
    Write-Host "  docker compose logs -f     - логи всех сервисов" -ForegroundColor White
    Write-Host "  docker compose down        - остановить проект" -ForegroundColor White
    Write-Host "  docker compose restart     - перезапустить проект" -ForegroundColor White
} else {
    Write-Host "`n✗ Ошибка при запуске проекта" -ForegroundColor Red
    Write-Host "Проверьте логи: docker compose logs" -ForegroundColor Yellow
    exit 1
}
