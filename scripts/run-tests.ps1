# Run CI-like tests locally (backend pytest + frontend lint, type-check, jest)
# Usage: .\scripts\run-tests.ps1 (or scripts\run-tests.bat). Run from anywhere.
# Backend tests require Docker: postgres + redis (started automatically if needed).
# Uses npm.cmd to avoid PowerShell execution policy issues (npm.ps1 blocked).

$ErrorActionPreference = "Stop"
$npm = "npm.cmd"
# Repo root = parent of scripts/ (contains backend, frontend, .github)
$root = (Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path
if (-not (Test-Path "$root\backend") -or -not (Test-Path "$root\frontend")) {
    Write-Host "Run from repo root. Expected backend/ and frontend/." -ForegroundColor Red
    exit 1
}
Push-Location $root

function Write-Step { param($Msg) Write-Host "`n===> $Msg" -ForegroundColor Cyan }
function Write-Ok   { param($Msg) Write-Host "  OK $Msg" -ForegroundColor Green }
function Write-Warn { param($Msg) Write-Host "  !! $Msg" -ForegroundColor Yellow }
function Write-Fail { param($Msg) Write-Host "  FAIL $Msg" -ForegroundColor Red }

$failed = $false

# --- Backend (pytest) ---
Write-Step "Backend tests (pytest)"
try {
    $docker = docker info 2>$null
    if ($LASTEXITCODE -ne 0) { throw "Docker not running" }
    # Ensure postgres + redis are up
    docker compose up -d postgres redis 2>&1 | Out-Null
    $null = docker compose exec -T postgres pg_isready -U leadgen_user 2>$null
    for ($i = 0; $i -lt 30; $i++) {
        if ((docker compose exec -T postgres pg_isready -U leadgen_user 2>$null) -match "accepting") { break }
        Start-Sleep -Seconds 1
    }
    docker compose run --rm -e ENVIRONMENT=test -e DEBUG=False backend pytest -q 2>&1
    if ($LASTEXITCODE -ne 0) { $failed = $true; Write-Fail "Backend tests failed" } else { Write-Ok "Backend tests passed" }
} catch {
    Write-Warn "Backend tests skipped (Docker/postgres needed). Run: docker compose up -d postgres redis && docker compose run --rm -e ENVIRONMENT=test -e DEBUG=False backend pytest -q"
}

# --- Frontend ---
Write-Step "Frontend: install deps"
Push-Location "$root\frontend"
try {
    & $npm ci 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { & $npm install 2>&1 | Out-Null }
} catch { Write-Warn "npm ci failed, trying npm install"; & $npm install 2>&1 | Out-Null }
Pop-Location

Write-Step "Frontend: lint"
Push-Location "$root\frontend"
& $npm run lint 2>&1
if ($LASTEXITCODE -ne 0) { $failed = $true; Write-Fail "Lint failed" } else { Write-Ok "Lint passed" }
Pop-Location

Write-Step "Frontend: type-check"
Push-Location "$root\frontend"
& $npm run type-check 2>&1
if ($LASTEXITCODE -ne 0) { $failed = $true; Write-Fail "Type-check failed" } else { Write-Ok "Type-check passed" }
Pop-Location

Write-Step "Frontend: tests (jest)"
Push-Location "$root\frontend"
& $npm test -- --runInBand --passWithNoTests 2>&1
if ($LASTEXITCODE -ne 0) { $failed = $true; Write-Fail "Jest failed" } else { Write-Ok "Jest passed" }
Pop-Location

Pop-Location
if ($failed) { Write-Host "`nSome checks failed." -ForegroundColor Red; exit 1 }
Write-Host "`nAll checks passed." -ForegroundColor Green
exit 0
