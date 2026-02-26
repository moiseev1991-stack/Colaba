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
    # Internal DNS failed. Fall back to the plain internal hostname so that
    # route.ts connects directly (no external URL, no hairpin NAT bypass).
    # Do NOT use INTERNAL_BACKEND_ORIGIN here even if it is set — it may
    # point to an external sslip.io URL which would cause coolify-proxy timeouts.
    FALLBACK="http://$BACKEND_HOSTNAME:$BACKEND_PORT"
    echo "[entrypoint] WARNING: could not resolve $BACKEND_HOSTNAME after $MAX_ATTEMPTS attempts"
    echo "[entrypoint] Falling back to: $FALLBACK"
    echo "$FALLBACK" > /tmp/backend-origin
fi

echo "[entrypoint] Backend origin: $(cat /tmp/backend-origin)"
exec "$@"
