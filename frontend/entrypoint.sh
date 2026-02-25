#!/bin/sh
# Resolve backend hostname to IP before starting Next.js.
# DNS works reliably in fresh node processes but fails in the long-running
# Next.js process due to Docker DNS/iptables behaviour differences.
# By resolving once at startup and passing the IP via env, the proxy
# never needs to do DNS resolution at request time.

BACKEND_HOSTNAME="${BACKEND_HOSTNAME:-backend}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
MAX_ATTEMPTS=30

echo "[entrypoint] Resolving $BACKEND_HOSTNAME..."

for i in $(seq 1 $MAX_ATTEMPTS); do
    BACKEND_IP=$(node -e "
require('dns/promises').resolve4('$BACKEND_HOSTNAME')
  .then(ips => process.stdout.write(ips[0]))
  .catch(() => process.exit(1))
" 2>/dev/null || echo "")

    if [ -n "$BACKEND_IP" ]; then
        echo "[entrypoint] $BACKEND_HOSTNAME -> $BACKEND_IP"
        export INTERNAL_BACKEND_ORIGIN="http://$BACKEND_IP:$BACKEND_PORT"
        # Write to file so Next.js route handler can read it at runtime
        # (env var export is ignored because Next.js bakes process.env at build time)
        echo "http://$BACKEND_IP:$BACKEND_PORT" > /tmp/backend-origin
        break
    fi

    echo "[entrypoint] attempt $i/$MAX_ATTEMPTS failed, waiting 2s..."
    sleep 2
done

if [ -z "$BACKEND_IP" ]; then
    echo "[entrypoint] WARNING: could not resolve $BACKEND_HOSTNAME, keeping hostname"
fi

echo "[entrypoint] INTERNAL_BACKEND_ORIGIN=${INTERNAL_BACKEND_ORIGIN:-http://$BACKEND_HOSTNAME:$BACKEND_PORT}"
exec "$@"
