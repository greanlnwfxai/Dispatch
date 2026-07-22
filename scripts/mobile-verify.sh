#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# mobile-verify.sh — Mobile/PWA reachability and manifest check
#   (DEV-FOUNDATION-001)
#
#   apps/mobile-pwa is a Next.js App Router PWA, not Expo — this checks HTTP
#   reachability, the "Dispatch Mobile/PWA" foundation marker, and that the
#   PWA manifest route (app/manifest.ts -> /manifest.webmanifest) responds
#   with valid JSON.
#
#   Requires: a running stack at MOBILE_PWA_URL (default http://localhost:6003)
# ─────────────────────────────────────────────────────────────────────────────

MOBILE_URL="${MOBILE_PWA_URL:-http://localhost:6003}"

pass() { printf '\033[0;32m[PASS]\033[0m %s\n' "$1"; }
info() { printf '\033[0;34m[....]\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31m[FAIL]\033[0m %s\n' "$1" >&2; }

trap 'fail "mobile-verify.sh failed (line $LINENO)"' ERR

echo "=============================================="
echo " Dispatch — Mobile/PWA Verify"
echo "=============================================="

info "Checking ${MOBILE_URL} (expect HTTP 200)..."
HTTP_STATUS="$(curl -s -o /tmp/dispatch-mobile-response.html -w '%{http_code}' --max-time 10 "$MOBILE_URL")"
if [ "$HTTP_STATUS" != "200" ]; then
  fail "Mobile/PWA returned HTTP ${HTTP_STATUS}, expected 200"
  exit 1
fi
pass "Mobile/PWA reachable (HTTP 200)"

if ! grep -q "Dispatch Mobile/PWA" /tmp/dispatch-mobile-response.html; then
  fail "Response body does not contain the 'Dispatch Mobile/PWA' foundation marker"
  rm -f /tmp/dispatch-mobile-response.html
  exit 1
fi
pass "Foundation marker 'Dispatch Mobile/PWA' present"
rm -f /tmp/dispatch-mobile-response.html

info "Checking ${MOBILE_URL}/manifest.webmanifest..."
MANIFEST="$(curl -fsS --max-time 10 "${MOBILE_URL}/manifest.webmanifest")"
if command -v jq >/dev/null 2>&1; then
  MANIFEST_NAME="$(echo "$MANIFEST" | jq -r '.name')"
  if [ "$MANIFEST_NAME" != "Dispatch Mobile/PWA" ]; then
    fail "manifest.webmanifest name field was '${MANIFEST_NAME}', expected 'Dispatch Mobile/PWA'"
    exit 1
  fi
  pass "manifest.webmanifest is valid JSON with the expected name"
else
  if ! echo "$MANIFEST" | grep -q "Dispatch Mobile/PWA"; then
    fail "manifest.webmanifest does not contain the expected name"
    exit 1
  fi
  pass "manifest.webmanifest reachable (jq not installed — skipped structured check)"
fi

echo "=============================================="
pass "MOBILE/PWA VERIFY PASSED"
echo "=============================================="
