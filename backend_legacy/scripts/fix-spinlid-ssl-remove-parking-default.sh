#!/bin/bash
# Отключает 443 у parking (явный listen 88.210.53.183:443), чтобы весь HTTPS
# обслуживал блок spinlid с корректным сертификатом.
# Запуск: sudo bash scripts/fix-spinlid-ssl-remove-parking-default.sh
set -e
PARKING=/etc/nginx/conf.d/parking.conf
if [ ! -f "$PARKING" ]; then
  echo "Not found: $PARKING"
  exit 1
fi
# Убрать default_server если ещё есть
sed -i 's/listen 88.210.53.183:443 ssl default_server;/listen 88.210.53.183:443 ssl;/' "$PARKING"
# Закомментировать listen 443 у parking — иначе запросы к 88.210.53.183:443 идут в parking
sed -i 's/^[[:space:]]*listen 88.210.53.183:443 ssl;$/    # listen 88.210.53.183:443 ssl;  # отключено для spinlid SSL/' "$PARKING"
nginx -t && systemctl reload nginx
echo "Done. Check: curl -vI https://spinlid.ru"
