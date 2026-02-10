#!/bin/bash
# Применяет default_server для spinlid на 443.
# Запуск: sudo bash scripts/apply-spinlid-nginx-default-server.sh
set -e
CONF=/etc/nginx/sites-available/spinlid-frontend.conf
if [ ! -f "$CONF" ]; then
  echo "Config not found: $CONF"
  exit 1
fi
# Добавить default_server и listen [::]:443
sed -i 's/^  listen 443 ssl http2;$/  listen 443 ssl http2 default_server;\n  listen [::]:443 ssl http2 default_server;/' "$CONF" || \
sed -i 's/^  listen 443 ssl http2;$/  listen 443 ssl http2 default_server;\
  listen [::]:443 ssl http2 default_server;/' "$CONF"
nginx -t && systemctl reload nginx
echo "Nginx reloaded. Check: curl -vI https://spinlid.ru"
