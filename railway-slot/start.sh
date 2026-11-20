#!/bin/sh
set -eu

if [ -n "${FRP_TOKEN:-}" ]; then
    sed "s|^auth.token = .*|auth.token = \"${FRP_TOKEN}\"|" /frp/frps.toml > /tmp/frps.runtime.toml
    FRPS_CONF="/tmp/frps.runtime.toml"
else
    FRPS_CONF="/frp/frps.toml"
fi

cleanup() {
    kill -TERM "$SSLH_PID" "$FRPS_PID" 2>/dev/null || true
    wait "$SSLH_PID" 2>/dev/null || true
    wait "$FRPS_PID" 2>/dev/null || true
}

term() {
    cleanup
    exit 0
}

trap term INT TERM
trap cleanup EXIT

/frp/frps -c "$FRPS_CONF" &
FRPS_PID=$!

if sslh -h 2>&1 | grep -q -- '--tls'; then
    TLS_OPT="--tls"
else
    TLS_OPT="--ssl"
fi

sslh -f -u root \
  -p "0.0.0.0:${PORT:-8080}" \
  --ssh "127.0.0.1:6000" \
  "$TLS_OPT" "127.0.0.1:7000" \
  --on-timeout ssh \
  --timeout 2 &
SSLH_PID=$!

while kill -0 "$FRPS_PID" 2>/dev/null && kill -0 "$SSLH_PID" 2>/dev/null; do
    sleep 2
done

exit 1
