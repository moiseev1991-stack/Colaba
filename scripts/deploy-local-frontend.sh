#!/usr/bin/env bash
# Локальная часть деплоя: билд фронта → save → scp на прод.
# Запуск (в git-bash на Windows):
#   bash /e/cod/Colaba/scripts/deploy-local-frontend.sh
#
# Требования:
#  - Docker Desktop запущен и отвечает (`docker version` показывает Server)
#  - SSH-ключ ~/.ssh/colaba_server существует
#  - Сеть до 88.210.53.183 работает
set -euo pipefail

TAR=/c/Users/Dima/AppData/Local/Temp/colaba-frontend.tar
IMAGE=ghcr.io/moiseev1991-stack/colaba-frontend:latest
REPO=/e/cod/Colaba
SSH_KEY=~/.ssh/colaba_server
PROD=root@88.210.53.183

echo "=== 1/5: очистка старого tarball ==="
rm -f "$TAR"
ssh -i "$SSH_KEY" "$PROD" "rm -f /tmp/colaba-frontend.tar"

echo "=== 2/5: docker version (проверка демона) ==="
docker version >/dev/null || { echo "Docker Desktop не запущен. Открой его и подожди зелёную иконку в трее."; exit 1; }

echo "=== 3/5: docker build (5–15 минут) ==="
cd "$REPO"
docker build -f frontend/Dockerfile -t "$IMAGE" frontend

echo "=== 4/5: docker save → $TAR ==="
docker save "$IMAGE" -o "$TAR"
ls -lh "$TAR"

echo "=== 5/5: scp на $PROD ==="
scp -i "$SSH_KEY" "$TAR" "$PROD:/tmp/colaba-frontend.tar"

echo
echo "ГОТОВО. Теперь зайди на прод:"
echo "  ssh -i $SSH_KEY $PROD"
echo "и запусти на проде:"
echo "  bash <(curl -sS file:///opt/colaba-src/scripts/deploy-prod-apply.sh) || true"
echo "Либо вручную: bash /opt/colaba-src/scripts/deploy-prod-apply.sh"
echo "(скрипт лежит в репо — git pull на проде подтянет его в /opt/colaba-src)"
