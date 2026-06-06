#!/usr/bin/env bash
# ОДНА КОМАНДА для деплоя текущего main на spinlid.ru.
#
# Запускать в git-bash на Windows (не в PowerShell):
#   bash /e/cod/Colaba/scripts/deploy-prod-now.sh
#
# Что делает:
#   1) Локально: docker build фронта → save в tar → scp на VPS
#      (это твой существующий deploy-local-frontend.sh, 5-15 минут).
#   2) На VPS по SSH: подтягивает свежий main и запускает
#      deploy-prod-apply.sh (docker cp router.py в backend + restart +
#      подмена .next в Coolify-managed контейнере spinlid.ru).
#
# Итог: на spinlid.ru приедут изменения из main без Coolify-rebuild
# (который падает на OOM при npm install / next build).

set -euo pipefail

REPO=/e/cod/Colaba
SSH_KEY=~/.ssh/colaba_server
PROD=root@88.210.53.183

echo
echo "========================================"
echo "ШАГ 1/2: локальный билд + загрузка на VPS"
echo "========================================"
bash "$REPO/scripts/deploy-local-frontend.sh"

echo
echo "========================================"
echo "ШАГ 2/2: применение на VPS"
echo "========================================"
ssh -i "$SSH_KEY" "$PROD" 'bash -s' <<'REMOTE'
set -euo pipefail
cd /opt/colaba-src

echo "  → git fetch origin main"
git fetch origin main
git reset --hard origin/main
git log --oneline -3

echo "  → bash scripts/deploy-prod-apply.sh"
bash scripts/deploy-prod-apply.sh
REMOTE

echo
echo "================================"
echo "ВСЁ. Открой https://spinlid.ru/app/leads (Ctrl+F5)"
echo "и проверь визуально изменения из последних merge в main."
echo "================================"
