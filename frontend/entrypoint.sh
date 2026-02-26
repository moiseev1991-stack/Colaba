#!/bin/sh
# Resolve backend hostname to IP before starting Next.js.
# DNS works reliably in fresh node processes but fails in the long-running
# Next.js process due to Docker DNS/iptables behaviour differences.
# By resolving once at startup and passing the IP via env, the proxy
# never needs to do DNS resolution at request time.

BACKEND_HOSTNAME="${BACKEND_HOSTNAME:-backend}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
MAX_ATTEMPTS=30

# If INTERNAL_BACKEND_ORIGIN is already set to an external URL (hostname contains a dot
# — it's a real DNS name, not an internal Docker alias like "backend"), use it directly.
# This handles platforms like Coolify where the operator sets the backend URL explicitly.
if [ -n "$INTERNAL_BACKEND_ORIGIN" ]; then
    _HOST=$(echo "$INTERNAL_BACKEND_ORIGIN" | sed 's|https\?://||;s|/.*||;s|:.*||')
    if echo "$_HOST" | grep -qF '.'; then
        echo "[entrypoint] Using pre-configured INTERNAL_BACKEND_ORIGIN=$INTERNAL_BACKEND_ORIGIN"
        echo "$INTERNAL_BACKEND_ORIGIN" > /tmp/backend-origin
        exec "$@"
    fi
fi

echo "[entrypoint] Resolving $BACKEND_HOSTNAME..."

for i in $(seq 1 $MAX_ATTEMPTS); do
    BACKEND_IP=$(node -e "
require('dns').lookup('$BACKEND_HOSTNAME',{family:4},function(err,addr){
  if(err){process.exit(1);}
  process.stdout.write(addr);
});
" 2>/dev/null || echo "")

    if [ -n "$BACKEND_IP" ]; then
        echo "[entrypoint] $BACKEND_HOSTNAME -> $BACKEND_IP"
        export INTERNAL_BACKEND_ORIGIN="http://$BACKEND_IP:$BACKEND_PORT"
        echo "http://$BACKEND_IP:$BACKEND_PORT" > /tmp/backend-origin
        # Write to /etc/hosts so ALL processes (including long-running Next.js)
        # can resolve the hostname via getaddrinfo without querying Docker DNS.
        # /etc/hosts is checked before DNS and works in every process context.
        echo "$BACKEND_IP $BACKEND_HOSTNAME" >> /etc/hosts
        echo "[entrypoint] /etc/hosts: added $BACKEND_IP $BACKEND_HOSTNAME"
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
