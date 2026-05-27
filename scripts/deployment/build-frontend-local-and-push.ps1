# Сборка frontend-образа ЛОКАЛЬНО (на машине разработчика, Docker Desktop)
# и его доставка на прод VPS через docker save | ssh docker load.
#
# Зачем: VPS spinlid (88.210.53.183) имеет только 3.8GB RAM, из них ~970MB
# свободно. `docker build frontend` (npm ci + next build) на нём стабильно
# вызывает OOM-killer, который кладёт Traefik+Coolify заодно со сборкой.
# Локально на Windows-машине Димы (16GB+ RAM) сборка проходит за пару минут.
#
# Требования:
#   - Docker Desktop запущен.
#   - SSH-доступ root@88.210.53.183 (по паролю или по ключу).
#
# Запуск:
#   pwsh scripts/deployment/build-frontend-local-and-push.ps1
# или:
#   pwsh scripts/deployment/build-frontend-local-and-push.ps1 -SshHost root@88.210.53.183 -Tag latest

param(
    [string]$SshHost = "root@88.210.53.183",
    [string]$Tag = "latest",
    [string]$ImageName = "ghcr.io/moiseev1991-stack/colaba-frontend"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path "$PSScriptRoot/../..").Path
Write-Host "Repo root: $repoRoot" -ForegroundColor Cyan

# 1. Build локально
$fullImage = "${ImageName}:${Tag}"
Write-Host "==> 1/4 Сборка $fullImage из $repoRoot/frontend" -ForegroundColor Yellow
docker build -t $fullImage "$repoRoot/frontend"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Билд провалился. Проверь Docker Desktop." -ForegroundColor Red
    exit 1
}

# 2. Save в tarball
$tarPath = "$env:TEMP\colaba-frontend-$Tag.tar"
Write-Host "==> 2/4 Сохраняем образ в $tarPath" -ForegroundColor Yellow
docker save -o $tarPath $fullImage
$sizeMb = [math]::Round((Get-Item $tarPath).Length / 1MB, 1)
Write-Host "    Размер: ${sizeMb} MB" -ForegroundColor Gray

# 3. SCP на сервер
Write-Host "==> 3/4 Заливаем на $SshHost (может занять минуты — ${sizeMb}MB)" -ForegroundColor Yellow
scp $tarPath "${SshHost}:/tmp/colaba-frontend.tar"

# 4. Загрузка образа в Docker на сервере + recreate frontend контейнера
Write-Host "==> 4/4 Загружаем образ на сервере и пересоздаём контейнер" -ForegroundColor Yellow
$remoteScript = @"
set -e
docker load -i /tmp/colaba-frontend.tar
rm /tmp/colaba-frontend.tar
cd /opt/colaba
export BACKEND_IMAGE=ghcr.io/moiseev1991-stack/colaba-backend
export FRONTEND_IMAGE=$ImageName
export IMAGE_TAG=$Tag
docker compose -f docker-compose.prod.yml up -d --force-recreate --pull never --no-build frontend
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' | grep -E 'frontend|backend'
"@
ssh $SshHost "bash -s" <<< $remoteScript

# Cleanup
Remove-Item $tarPath -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Готово. Проверка снаружи:" -ForegroundColor Green
$site = Invoke-WebRequest -Uri "https://spinlid.ru/" -TimeoutSec 15 -UseBasicParsing -SkipHttpErrorCheck
Write-Host "  https://spinlid.ru/ : HTTP $($site.StatusCode)" -ForegroundColor Cyan
