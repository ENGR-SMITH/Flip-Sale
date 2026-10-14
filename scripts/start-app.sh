#!/usr/bin/env bash
# ============================================================================
# Flip Sale one-command launcher: API server (:5000) + operator dashboard (:5173)
#
# Usage (from the project root):
#   bash scripts/start-app.sh             # build the API server, then start both
#   SKIP_BUILD=1 bash scripts/start-app.sh   # skip rebuild (dist already current)
#   bash scripts/start-app.sh --api-only  # start only the API server
#
# Stop with Ctrl+C — this stops both processes cleanly.
# First-time setup (accounts, .env, pnpm install, DB push) is documented in
# GETTING-STARTED.md at the project root.
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"

# --- 1. Pre-flight: .env must exist with the required keys -----------------
missing=0
if [ ! -s "$ENV_FILE" ]; then
  echo "ERROR: .env not found at $ENV_FILE — see GETTING-STARTED.md section 2." >&2
  exit 1
fi
for key in DATABASE_URL APIFY_API_TOKEN CLERK_SECRET_KEY CLERK_PUBLISHABLE_KEY VITE_CLERK_PUBLISHABLE_KEY; do
  if ! grep -q "^${key}=..*" "$ENV_FILE" 2>/dev/null; then
    echo "ERROR: '$key' is empty or missing in .env — see GETTING-STARTED.md section 2." >&2
    missing=1
  fi
done
[ "$missing" = 1 ] && exit 1

# --- 2. Build the API server (unless skipped) ---------------------------------
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "== Building API server..."
  pnpm --filter @workspace/api-server run build
fi

api_pid=""
web_pid=""

cleanup() {
  echo
  echo "== Stopping servers..."
  [ -n "$api_pid" ] && kill "$api_pid" 2>/dev/null || true
  [ -n "$web_pid" ] && kill "$web_pid" 2>/dev/null || true
  wait 2>/dev/null || true
  echo "Servers stopped."
}
trap cleanup EXIT INT TERM

# --- 3. Start the API server --------------------------------------------------
echo "== Starting API server on http://localhost:5000 ..."
PORT=5000 node --env-file="$ENV_FILE" --enable-source-maps \
  "$ROOT/artifacts/api-server/dist/index.mjs" &
api_pid=$!

sleep 2
if ! kill -0 "$api_pid" 2>/dev/null; then
  echo "ERROR: API server exited immediately — check the log output above." >&2
  exit 1
fi
echo "API server running (pid $api_pid)."

# --- 4. Start the operator dashboard ------------------------------------------
if [ "${1:-}" != "--api-only" ]; then
  echo "== Starting operator dashboard on http://localhost:5173 ..."
  (
    cd "$ROOT/artifacts/distress-intelligence" &&
      PORT=5173 BASE_PATH=/ node --env-file="$ENV_FILE" \
        node_modules/vite/bin/vite.js --config vite.config.ts --host 0.0.0.0
  ) &
  web_pid=$!
  echo "Dashboard running (pid $web_pid)."
fi

echo
echo "============================================================"
if [ "${1:-}" = "--api-only" ]; then
  echo "  API server:  http://localhost:5000/api/healthz"
else
  echo "  Dashboard:   http://localhost:5173"
  echo "  API server:  http://localhost:5000/api/healthz"
fi
echo "  Stop:        Ctrl+C"
echo "  Source collection (Apify + public feeds) runs automatically."
echo "============================================================"
echo

# --- 5. Wait until one of the servers exits ------------------------------------
wait -n "$api_pid" ${web_pid:-}
