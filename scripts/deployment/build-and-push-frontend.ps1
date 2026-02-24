# Build frontend image locally and push to GitHub Container Registry (GHCR)
# Requires: Docker Desktop running, GitHub PAT with write:packages

param(
    [string]$GitHubUser = "moiseev1991-stack",
    [string]$RepoName = "colaba",
    [string]$Tag = "latest"
)

$ErrorActionPreference = "Stop"
$Image = "ghcr.io/$GitHubUser/${RepoName}-frontend"
$FullTag = "${Image}:${Tag}"

Write-Host "Building frontend image..." -ForegroundColor Cyan
Set-Location (Join-Path $PSScriptRoot "../../frontend")
docker build -t $FullTag .

if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "`nLogin to GHCR (ghcr.io). Use GitHub username and PAT with write:packages:" -ForegroundColor Yellow
echo $env:GHCR_TOKEN | docker login ghcr.io -u $GitHubUser --password-stdin
if ($LASTEXITCODE -ne 0) {
    Write-Host "Set GHCR_TOKEN: `$env:GHCR_TOKEN = 'your_github_pat'" -ForegroundColor Red
    exit 1
}

Write-Host "`nPushing $FullTag ..." -ForegroundColor Cyan
docker push $FullTag

if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "`nDone. Image: $FullTag" -ForegroundColor Green
Write-Host "In Coolify set: FRONTEND_IMAGE=$Image IMAGE_TAG=$Tag (and Redeploy)" -ForegroundColor Yellow
