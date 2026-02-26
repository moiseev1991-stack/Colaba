#!/bin/sh
# Resolve backend hostname to IP before starting Next.js.
# DNS works reliably in fresh node processes but fails in the long-running
# Next.js process due to Docker DNS/iptables behaviour differences.
# By resolving once at startup and passing the IP via env, the proxy
# never needs to do DNS resolution at request time.
#
# IMPORTANT: Always resolve BACKEND_HOSTNAME (internal Docker alias) first,
# even if INTERNAL_BACKEND_ORIGIN is set to an external URL. External URLs
# cause hairpin NAT issues when routed through coolify-proxy. The internal
# Docker network path is always preferred.

BACKEND_HOSTNAME="${BACKEND_HOSTNAME:-backend}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
MAX_ATTEMPTS=30
BACKEND_IP=""

echo "[entrypoint] Resolving internal hostname: $BACKEND_HOSTNAME ..."

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
    # Internal DNS failed (frontend may be in a separate Docker network from backend).
    # Fall back to INTERNAL_BACKEND_ORIGIN if set — on Coolify this may be the
    # backend's sslip.io URL. The hairpin NAT bypass in route.ts will route via
    # coolify-proxy, which works as long as the backend is in the coolify network.
    if [ -n "$INTERNAL_BACKEND_ORIGIN" ]; then
        FALLBACK="$INTERNAL_BACKEND_ORIGIN"
    else
        FALLBACK="http://$BACKEND_HOSTNAME:$BACKEND_PORT"
    fi
    echo "[entrypoint] WARNING: could not resolve $BACKEND_HOSTNAME after $MAX_ATTEMPTS attempts"
    echo "[entrypoint] Falling back to: $FALLBACK"
    echo "$FALLBACK" > /tmp/backend-origin
fi

echo "[entrypoint] Backend origin: $(cat /tmp/backend-origin)"
exec "$@"
