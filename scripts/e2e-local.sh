#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# e2e-local.sh — local-safe Playwright E2E runner (DEV-FOUNDATION-001)
#
#   1. Build/start the Docker stack non-destructively (docker compose up -d
#      --build), reusing the same wait logic as docker-verify.sh.
#   2. Run the foundation Playwright suite (e2e/tests/foundation.spec.ts)
#      against the running stack.
#   3. Leave the stack running — this script never tears anything down.
# ─────────────────────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

HEALTH_URL="http://localhost:6002/health"
ADMIN_WEB_URL="http://localhost:6001"
MOBILE_PWA_URL="http://localhost:6003"
MAX_WAIT=180

pass() { printf '\033[0;32m[PASS]\033[0m %s\n' "$1"; }
info() { printf '\033[0;34m[....]\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31m[FAIL]\033[0m %s\n' "$1" >&2; }

trap 'fail "e2e-local.sh failed (line $LINENO) — containers were left running for inspection"' ERR

# ── Safety guard ──────────────────────────────────────────────────────────────
SELF="${BASH_SOURCE[0]}"
FORBIDDEN_PATTERN='docker[[:space:]]+compose[[:space:]]+down|docker[[:space:]]+system[[:space:]]+prune|docker[[:space:]]+volume[[:space:]]+rm|docker[[:space:]]+container[[:space:]]+rm|docker[[:space:]]+image[[:space:]]+rm|docker[[:space:]]+network[[:space:]]+rm'
if grep -vE '^[[:space:]]*#' "$SELF" | grep -Eq "$FORBIDDEN_PATTERN"; then
  fail "Safety guard tripped: a destructive Docker command was found in $(basename "$SELF"). Refusing to run."
  exit 1
fi

echo "=============================================="
echo " Dispatch — Local-Safe E2E Runner"
echo "=============================================="

info "Building and starting stack (docker compose up -d --build)..."
docker compose up -d --build
pass "Stack build/start complete"

info "Waiting for API health at ${HEALTH_URL} (max ${MAX_WAIT}s)..."
elapsed=0
until curl -fsS "$HEALTH_URL" >/dev/null 2>&1; do
  if [ "$elapsed" -ge "$MAX_WAIT" ]; then
    fail "API did not become healthy within ${MAX_WAIT}s"
    docker compose logs api --tail=100
    exit 1
  fi
  sleep 3
  elapsed=$((elapsed + 3))
done
pass "API health check OK"

wait_for_reachable() {
  local url="$1" name="$2" service="$3"
  local elapsed=0
  until curl -fsS --max-time 5 "$url" >/dev/null 2>&1; do
    if [ "$elapsed" -ge "$MAX_WAIT" ]; then
      fail "${name} not reachable at ${url} within ${MAX_WAIT}s"
      docker compose logs "$service" --tail=100
      exit 1
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done
  pass "${name} reachable"
}

wait_for_reachable "$ADMIN_WEB_URL" "Admin Web" "admin-web"
wait_for_reachable "$MOBILE_PWA_URL" "Mobile/PWA" "mobile-pwa"

info "Installing Playwright browsers if needed (e2e/)..."
cd "$ROOT/e2e"
npx playwright install --with-deps chromium

info "Running Playwright E2E tests (e2e/tests/foundation.spec.ts)..."
E2E_ADMIN_WEB_URL="$ADMIN_WEB_URL" E2E_MOBILE_PWA_URL="$MOBILE_PWA_URL" E2E_API_URL="http://localhost:6002" \
  npm run test:e2e -- "$@"

echo "=============================================="
pass "LOCAL E2E RUN COMPLETE"
info "Containers are left running (non-destructive) — no teardown was performed."
echo "=============================================="
