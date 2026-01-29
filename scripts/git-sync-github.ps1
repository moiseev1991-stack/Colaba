# Подключение к GitHub и загрузка последних изменений
# Запуск: правый клик -> "Выполнить с PowerShell" или из терминала: .\scripts\git-sync-github.ps1

Set-Location $PSScriptRoot\..
Write-Host "Repository: $(Get-Location)" -ForegroundColor Cyan
Write-Host ""
Write-Host "Remote:" -ForegroundColor Yellow
git remote -v
Write-Host ""
Write-Host "Fetching from origin..." -ForegroundColor Yellow
git fetch origin
if ($LASTEXITCODE -ne 0) { Write-Host "Fetch failed." -ForegroundColor Red; exit 1 }
Write-Host ""
Write-Host "Pulling main..." -ForegroundColor Yellow
git pull origin main
Write-Host ""
Write-Host "Status:" -ForegroundColor Yellow
git status
Write-Host ""
Write-Host "Done." -ForegroundColor Green
