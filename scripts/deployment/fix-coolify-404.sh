#!/usr/bin/env bash
# Подключает coolify-proxy к сети приложения Colaba — исправляет 404 при доступе по домену.
# Запускать на сервере: bash scripts/deployment/fix-coolify-404.sh

set -euo pipefail

echo "Поиск сети приложения Colaba..."
# Приоритет: colaba_leadgen-network (деплой из /opt/colaba), затем okkkosgk8ckk, w0wok0gck, любая leadgen
NETWORK=$(docker network ls --format '{{.Name}}' | grep -E "colaba_leadgen-network|okkkosgk8ckk00g8goc8g4sk_leadgen|w0wok0gck048wwk0k8k4ck4s_leadgen" | head -1)

if [[ -z "$NETWORK" ]]; then
  echo "Сеть не найдена. Доступные сети:"
  docker network ls | grep -E "leadgen|colaba|okkkosgk"
  echo ""
  echo "Выполните вручную: docker network connect <ИМЯ_СЕТИ> coolify-proxy"
  exit 1
fi

echo "Найдена сеть: $NETWORK"
echo "Подключение coolify-proxy..."
docker network connect "$NETWORK" coolify-proxy 2>/dev/null || echo "coolify-proxy уже подключён или ошибка (проверьте логи)"

echo "Готово. Проверьте: docker network inspect $NETWORK --format '{{range .Containers}}{{.Name}} {{end}}'"
