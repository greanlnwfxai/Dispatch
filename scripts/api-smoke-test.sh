#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# api-smoke-test.sh — foundation API smoke test (DEV-FOUNDATION-002)
#
#   Only health/readiness endpoints exist at this milestone: GET /health,
#   GET /health/live, GET /health/ready. No auth endpoints, no business
#   endpoints — do not add /auth/login or any /delivery-tasks-style checks
#   here until those modules exist.
#
#   Requires: jq, a running stack at API_URL (default http://localhost:6002)
# ─────────────────────────────────────────────────────────────────────────────

API="${API_URL:-http://localhost:6002}"

pass() { printf '\033[0;32m[PASS]\033[0m %s\n' "$1"; }
info() { printf '\033[0;34m[....]\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31m[FAIL]\033[0m %s\n' "$1" >&2; }

trap 'fail "api-smoke-test.sh failed (line $LINENO)"' ERR

echo "=============================================="
echo " Dispatch — API Smoke Test (foundation)"
echo "=============================================="

if ! command -v jq >/dev/null 2>&1; then
  fail "jq is required but not installed"
  exit 1
fi
pass "jq present"

info "GET ${API}/health/live (expect HTTP 200, no database dependency)..."
LIVE_HTTP_STATUS="$(curl -s -o /tmp/dispatch-live-response.json -w '%{http_code}' "${API}/health/live")"
if [ "$LIVE_HTTP_STATUS" != "200" ]; then
  fail "GET /health/live returned HTTP ${LIVE_HTTP_STATUS}, expected 200"
  exit 1
fi
LIVE="$(cat /tmp/dispatch-live-response.json)"
rm -f /tmp/dispatch-live-response.json

LIVE_FIELD_COUNT="$(echo "$LIVE" | jq 'keys | length')"
if [ "$LIVE_FIELD_COUNT" != "2" ]; then
  fail "GET /health/live returned ${LIVE_FIELD_COUNT} fields, expected exactly 2 (status, service)"
  exit 1
fi
pass "GET /health/live returned HTTP 200 with exactly 2 fields"

info "GET ${API}/health (expect HTTP 200, database-aware readiness)..."
HTTP_STATUS="$(curl -s -o /tmp/dispatch-health-response.json -w '%{http_code}' "${API}/health")"
if [ "$HTTP_STATUS" != "200" ]; then
  fail "GET /health returned HTTP ${HTTP_STATUS}, expected 200"
  exit 1
fi
pass "GET /health returned HTTP 200"

HEALTH="$(cat /tmp/dispatch-health-response.json)"
rm -f /tmp/dispatch-health-response.json

STATUS="$(echo "$HEALTH" | jq -r '.status')"
if [ "$STATUS" != "ok" ]; then
  fail "GET /health did not return status=ok (got: ${STATUS})"
  exit 1
fi
pass "GET /health status field is ok"

SERVICE="$(echo "$HEALTH" | jq -r '.service')"
if [ "$SERVICE" != "dispatch-api" ]; then
  fail "GET /health did not return service=dispatch-api (got: ${SERVICE})"
  exit 1
fi
pass "GET /health service field is dispatch-api"

DATABASE="$(echo "$HEALTH" | jq -r '.database')"
if [ "$DATABASE" != "ok" ]; then
  fail "GET /health did not return database=ok (got: ${DATABASE})"
  exit 1
fi
pass "GET /health database field is ok"

FIELD_COUNT="$(echo "$HEALTH" | jq 'keys | length')"
if [ "$FIELD_COUNT" != "3" ]; then
  fail "GET /health returned ${FIELD_COUNT} fields, expected exactly 3 (status, service, database) — no extra/secret data"
  exit 1
fi
pass "GET /health exposes no unexpected fields"

info "GET ${API}/health/ready (expect HTTP 200, same shape as GET /health)..."
READY_HTTP_STATUS="$(curl -s -o /tmp/dispatch-ready-response.json -w '%{http_code}' "${API}/health/ready")"
if [ "$READY_HTTP_STATUS" != "200" ]; then
  fail "GET /health/ready returned HTTP ${READY_HTTP_STATUS}, expected 200"
  exit 1
fi
READY="$(cat /tmp/dispatch-ready-response.json)"
rm -f /tmp/dispatch-ready-response.json
if [ "$(echo "$READY" | jq -c .)" != "$(echo "$HEALTH" | jq -c .)" ]; then
  fail "GET /health/ready body did not match GET /health body"
  exit 1
fi
pass "GET /health/ready returned HTTP 200 with the expected readiness body"

echo "=============================================="
pass "API SMOKE TEST PASSED"
echo "=============================================="
