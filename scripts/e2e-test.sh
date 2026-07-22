#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# e2e-test.sh — Run the foundation Playwright E2E suite against an already
# running stack (CI/test environments).
#   Prerequisite: the stack is already up and healthy, e.g. via
#   ./scripts/docker-verify.sh or a CI job that starts docker compose itself.
# ─────────────────────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
E2E_DIR="$ROOT/e2e"

ADMIN_WEB_URL="${E2E_ADMIN_WEB_URL:-http://localhost:6001}"
MOBILE_PWA_URL="${E2E_MOBILE_PWA_URL:-http://localhost:6003}"
API_URL="${E2E_API_URL:-http://localhost:6002}"

pass() { printf '\033[0;32m[PASS]\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31m[FAIL]\033[0m %s\n' "$1" >&2; }
info() { printf '\033[0;34m[....]\033[0m %s\n' "$1"; }

echo "=============================================="
echo " Dispatch — Playwright E2E Tests (foundation)"
echo "=============================================="

info "Checking ${ADMIN_WEB_URL} ..."
if ! curl -fsS --max-time 5 "$ADMIN_WEB_URL" >/dev/null 2>&1; then
  fail "Admin Web not reachable at ${ADMIN_WEB_URL}. Run ./scripts/docker-verify.sh first."
  exit 1
fi
pass "Admin Web reachable"

info "Checking ${MOBILE_PWA_URL} ..."
if ! curl -fsS --max-time 5 "$MOBILE_PWA_URL" >/dev/null 2>&1; then
  fail "Mobile/PWA not reachable at ${MOBILE_PWA_URL}. Run ./scripts/docker-verify.sh first."
  exit 1
fi
pass "Mobile/PWA reachable"

info "Checking ${API_URL}/health ..."
if ! curl -fsS --max-time 5 "${API_URL}/health" >/dev/null 2>&1; then
  fail "API not reachable at ${API_URL}. Run ./scripts/docker-verify.sh first."
  exit 1
fi
pass "API reachable"

info "Running Playwright tests..."
cd "$E2E_DIR"
E2E_ADMIN_WEB_URL="$ADMIN_WEB_URL" E2E_MOBILE_PWA_URL="$MOBILE_PWA_URL" E2E_API_URL="$API_URL" \
  npm run test:e2e -- "$@"

echo "=============================================="
pass "E2E TESTS COMPLETE"
echo "=============================================="
