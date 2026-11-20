#!/usr/bin/env bash
set -euo pipefail

export BACKEND_ADDR="${BACKEND_ADDR:-127.0.0.1:8080}"
export BACKEND_INTERNAL_URL="${BACKEND_INTERNAL_URL:-http://${BACKEND_ADDR}}"
export CLIENT_SCRIPT_PATH="${CLIENT_SCRIPT_PATH:-/app/client/nekotunnel}"
export FRONTEND_HOST="${FRONTEND_HOST:-0.0.0.0}"
export PORT="${PORT:-3000}"

BACKEND_BIN="${BACKEND_BIN:-/app/nekotunnel-backend}"
FRONTEND_SERVER="${FRONTEND_SERVER:-/app/frontend/server.js}"

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill -TERM "$FRONTEND_PID" 2>/dev/null || true
    wait "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill -TERM "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
}

trap 'cleanup; exit 0' INT TERM

echo "[start.sh] Starting internal Rust backend on ${BACKEND_ADDR}..."
"$BACKEND_BIN" &
BACKEND_PID=$!

# Wait briefly for internal backend health endpoint
for _ in $(seq 1 40); do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "[start.sh] Rust backend exited prematurely!"
    exit 1
  fi
  if curl -fsS "${BACKEND_INTERNAL_URL}/health" >/dev/null 2>&1; then
    echo "[start.sh] Rust backend is healthy."
    break
  fi
  sleep 0.5
done

echo "[start.sh] Starting public Next.js frontend on ${FRONTEND_HOST}:${PORT}..."
HOSTNAME="${FRONTEND_HOST}" node "$FRONTEND_SERVER" &
FRONTEND_PID=$!

wait -n "$BACKEND_PID" "$FRONTEND_PID"
EXIT_CODE=$?
echo "[start.sh] A process exited (code ${EXIT_CODE}), shutting down..."
cleanup
exit "$EXIT_CODE"
