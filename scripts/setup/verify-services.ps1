# Проверка что все сервисы Colaba подняты и отвечают
# Запуск: .\scripts\setup\verify-services.ps1

$ErrorActionPreference = "Continue"
$baseUrlBackend = "http://localhost:8001"
$baseUrlFrontend = "http://localhost:4000"

Write-Host "`n=== Проверка сервисов Colaba ===" -ForegroundColor Green

# 1. Контейнеры
Write-Host "`n[1/4] Контейнеры leadgen-*..." -ForegroundColor Yellow
$containers = @("leadgen-postgres", "leadgen-redis", "leadgen-backend", "leadgen-celery-worker", "leadgen-frontend")
$allRunning = $true
foreach ($c in $containers) {
    $status = docker inspect -f "{{.State.Status}}" $c 2>$null
    if ($status -eq "running") {
        Write-Host "  OK $c" -ForegroundColor Green
    } else {
        Write-Host "  -- $c : $status" -ForegroundColor Red
        $allRunning = $false
    }
}

# 2. Backend health
Write-Host "`n[2/4] Backend /health..." -ForegroundColor Yellow
try {
    $r = Invoke-WebRequest -Uri "$baseUrlBackend/health" -UseBasicParsing -TimeoutSec 10
    if ($r.StatusCode -eq 200) {
        Write-Host "  OK $baseUrlBackend/health -> $($r.Content)" -ForegroundColor Green
    } else {
        Write-Host "  FAIL StatusCode: $($r.StatusCode)" -ForegroundColor Red
        $allRunning = $false
    }
} catch {
    Write-Host "  FAIL $($_.Exception.Message)" -ForegroundColor Red
    $allRunning = $false
}

# 3. Backend /ready
Write-Host "`n[3/4] Backend /ready..." -ForegroundColor Yellow
try {
    $r = Invoke-WebRequest -Uri "$baseUrlBackend/ready" -UseBasicParsing -TimeoutSec 10
    if ($r.StatusCode -eq 200) {
        Write-Host "  OK $baseUrlBackend/ready" -ForegroundColor Green
    } else {
        Write-Host "  FAIL StatusCode: $($r.StatusCode)" -ForegroundColor Red
    }
} catch {
    Write-Host "  FAIL $($_.Exception.Message)" -ForegroundColor Red
}

# 4. Frontend
Write-Host "`n[4/4] Frontend $baseUrlFrontend ..." -ForegroundColor Yellow
try {
    $r = Invoke-WebRequest -Uri $baseUrlFrontend -UseBasicParsing -TimeoutSec 15
    if ($r.StatusCode -eq 200) {
        Write-Host "  OK Frontend отвечает" -ForegroundColor Green
    } else {
        Write-Host "  FAIL StatusCode: $($r.StatusCode)" -ForegroundColor Red
        $allRunning = $false
    }
} catch {
    Write-Host "  FAIL $($_.Exception.Message)" -ForegroundColor Red
    $allRunning = $false
}

Write-Host ""
if ($allRunning) {
    Write-Host "=== Все проверки пройдены ===" -ForegroundColor Green
    Write-Host "  Frontend:  $baseUrlFrontend" -ForegroundColor Cyan
    Write-Host "  Backend:   $baseUrlBackend" -ForegroundColor Cyan
    Write-Host "  API Docs:  $baseUrlBackend/api/docs" -ForegroundColor Cyan
    exit 0
} else {
    Write-Host "=== Не все сервисы доступны ===" -ForegroundColor Yellow
    Write-Host "  Логи: docker compose logs -f" -ForegroundColor Cyan
    Write-Host "  Backend: docker logs leadgen-backend" -ForegroundColor Cyan
    exit 1
}
