#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# mobile-verify.sh — Mobile/PWA reachability, auth, and manifest check
#   (AUTH-001)
#
#   apps/mobile-pwa is a Next.js App Router PWA, not Expo. `/` is now a
#   client-rendered authenticated placeholder (AUTH-001) that redirects to
#   /login after a client-side session-bootstrap round trip — a plain curl
#   (no JS execution) only ever observes the pre-hydration "Loading…" shell
#   there, so the foundation-marker check below runs against /login
#   instead, whose form always server-renders regardless of auth state.
#
#   Requires: a running stack at MOBILE_PWA_URL (default http://localhost:6003)
# ─────────────────────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_URL="${MOBILE_PWA_URL:-http://localhost:6003}"

pass() { printf '\033[0;32m[PASS]\033[0m %s\n' "$1"; }
info() { printf '\033[0;34m[....]\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31m[FAIL]\033[0m %s\n' "$1" >&2; }

trap 'fail "mobile-verify.sh failed (line $LINENO)"' ERR

echo "=============================================="
echo " Dispatch — Mobile/PWA Verify"
echo "=============================================="

info "Checking ${MOBILE_URL} (expect HTTP 200)..."
HTTP_STATUS="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$MOBILE_URL")"
if [ "$HTTP_STATUS" != "200" ]; then
  fail "Mobile/PWA returned HTTP ${HTTP_STATUS}, expected 200"
  exit 1
fi
pass "Mobile/PWA reachable (HTTP 200)"

info "Checking ${MOBILE_URL}/login is available and identifies itself (AUTH-001 login route)..."
LOGIN_HTTP_STATUS="$(curl -s -o /tmp/dispatch-mobile-login-response.html -w '%{http_code}' --max-time 10 "${MOBILE_URL}/login")"
if [ "$LOGIN_HTTP_STATUS" != "200" ]; then
  fail "/login returned HTTP ${LOGIN_HTTP_STATUS}, expected 200"
  rm -f /tmp/dispatch-mobile-login-response.html
  exit 1
fi
if ! grep -q "Dispatch Mobile/PWA" /tmp/dispatch-mobile-login-response.html; then
  fail "/login response body does not contain the 'Dispatch Mobile/PWA' foundation marker"
  rm -f /tmp/dispatch-mobile-login-response.html
  exit 1
fi
pass "/login is available and shows the 'Dispatch Mobile/PWA' foundation marker"
rm -f /tmp/dispatch-mobile-login-response.html

info "Scanning apps/mobile-pwa/src for client-side token-storage writes (AUTH-001)..."
TOKEN_STORAGE_PATTERN='(localStorage|sessionStorage)\.(setItem|removeItem)\(|indexedDB\.open\('
TOKEN_STORAGE_FINDINGS="$(grep -rnE "$TOKEN_STORAGE_PATTERN" \
  --include="*.ts" --include="*.tsx" \
  --exclude="*.test.ts" --exclude="*.test.tsx" --exclude="*.spec.ts" \
  --exclude-dir="__tests__" --exclude-dir="node_modules" --exclude-dir=".next" \
  "$ROOT/apps/mobile-pwa/src" 2>/dev/null || true)"
if [ -n "$TOKEN_STORAGE_FINDINGS" ]; then
  fail "Found client-side token-storage write(s) in apps/mobile-pwa/src:"
  echo "$TOKEN_STORAGE_FINDINGS"
  exit 1
fi
pass "No localStorage/sessionStorage/IndexedDB token-storage writes found in apps/mobile-pwa/src"

info "Confirming no service worker is registered to cache authentication responses..."
if [ -f "$ROOT/apps/mobile-pwa/public/sw.js" ] || grep -rq "serviceWorker.register" "$ROOT/apps/mobile-pwa/src" 2>/dev/null; then
  fail "A service worker was found — auth responses must never be cached by one (AUTH-001). Review before proceeding."
  exit 1
fi
pass "No service worker registered — auth responses cannot be cached by one (Cache-Control: no-store is the only control point)"

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
