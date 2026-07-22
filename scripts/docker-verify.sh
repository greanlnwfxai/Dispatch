#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# docker-verify.sh — full-stack Docker verification (NON-DESTRUCTIVE)
#
#   1. validate docker compose config
#   2. docker compose up -d --build   (build/start only — no teardown)
#   3. wait for db healthy (pg_isready via healthcheck)
#   4. wait for api healthy, then check GET /health body
#   5. check admin-web and mobile-pwa reachability
#   6. show docker compose ps
#   7. on failure, print recent logs (docker compose logs --tail) — read-only
#
# Exits non-zero if the stack fails to become healthy.
#
# SAFETY RULE (do not violate):
#   This script MUST NOT run `docker compose down` (with or without -v),
#   `docker system prune`, or any `docker volume/container/image/network rm`
#   command. It must never stop or remove containers, volumes, images, or
#   networks. Containers are left RUNNING when this script exits, whether
#   it passes or fails. Stopping/removing containers is a manual, explicit
#   user decision only — Claude/Codex must never run teardown commands.
# ─────────────────────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

HEALTH_URL="http://localhost:6002/health"
ADMIN_WEB_URL="http://localhost:6001"
MOBILE_PWA_URL="http://localhost:6003"
MAX_WAIT=180   # seconds — first build can be slow

pass() { printf '\033[0;32m[PASS]\033[0m %s\n' "$1"; }
info() { printf '\033[0;34m[....]\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31m[FAIL]\033[0m %s\n' "$1" >&2; }

trap 'fail "docker-verify.sh failed (line $LINENO) — containers were left running for inspection"' ERR

# ── Safety guard ──────────────────────────────────────────────────────────────
# Self-check: refuse to run if a destructive Docker command has been
# reintroduced into this file outside of a comment line.
SELF="${BASH_SOURCE[0]}"
FORBIDDEN_PATTERN='docker[[:space:]]+compose[[:space:]]+down|docker[[:space:]]+system[[:space:]]+prune|docker[[:space:]]+volume[[:space:]]+rm|docker[[:space:]]+container[[:space:]]+rm|docker[[:space:]]+image[[:space:]]+rm|docker[[:space:]]+network[[:space:]]+rm'
if grep -vE '^[[:space:]]*#' "$SELF" | grep -Eq "$FORBIDDEN_PATTERN"; then
  fail "Safety guard tripped: a destructive Docker command was found in $(basename "$SELF"). Refusing to run."
  exit 1
fi

echo "=============================================="
echo " Dispatch — Docker Verify (non-destructive)"
echo "=============================================="
info "This script does NOT stop or remove containers, volumes, images, or"
info "networks. It only validates config, builds/starts services, and checks"
info "health. Containers will remain running after this script finishes."

info "Validating docker compose config..."
docker compose config >/dev/null
pass "docker compose config valid"

info "Building and starting stack (docker compose up -d --build)..."
docker compose up -d --build
pass "docker compose up -d --build complete"

info "Waiting for db to report healthy (max ${MAX_WAIT}s)..."
elapsed=0
until [ "$(docker inspect -f '{{.State.Health.Status}}' dispatch-db 2>/dev/null || echo starting)" = "healthy" ]; do
  if [ "$elapsed" -ge "$MAX_WAIT" ]; then
    fail "db did not become healthy within ${MAX_WAIT}s"
    echo "---- docker compose ps ----"
    docker compose ps
    echo "---- db logs (tail, read-only) ----"
    docker compose logs db --tail=100
    exit 1
  fi
  sleep 3
  elapsed=$((elapsed + 3))
done
pass "db healthy"

info "Waiting for api to report healthy (max ${MAX_WAIT}s)..."
elapsed=0
until [ "$(docker inspect -f '{{.State.Health.Status}}' dispatch-api 2>/dev/null || echo starting)" = "healthy" ]; do
  if [ "$elapsed" -ge "$MAX_WAIT" ]; then
    fail "api did not become healthy within ${MAX_WAIT}s"
    echo "---- docker compose ps ----"
    docker compose ps
    echo "---- api logs (tail, read-only) ----"
    docker compose logs api --tail=100
    exit 1
  fi
  sleep 3
  elapsed=$((elapsed + 3))
done
pass "api healthy"

info "Checking GET ${HEALTH_URL} response body (database-aware readiness, DEV-FOUNDATION-002)..."
HEALTH_BODY="$(curl -fsS "$HEALTH_URL")"
if [ "$HEALTH_BODY" != '{"status":"ok","service":"dispatch-api","database":"ok"}' ]; then
  fail "GET /health returned an unexpected body: ${HEALTH_BODY}"
  exit 1
fi
pass "GET /health returned the expected readiness body"

info "Checking GET ${HEALTH_URL}/live response body (liveness — no database dependency)..."
LIVE_BODY="$(curl -fsS "${HEALTH_URL}/live")"
if [ "$LIVE_BODY" != '{"status":"ok","service":"dispatch-api"}' ]; then
  fail "GET /health/live returned an unexpected body: ${LIVE_BODY}"
  exit 1
fi
pass "GET /health/live returned the expected liveness body"

wait_for_reachable() {
  local url="$1" name="$2" service="$3"
  local elapsed=0
  info "Checking ${name} reachability at ${url} (max ${MAX_WAIT}s)..."
  until curl -fsS --max-time 5 "$url" >/dev/null 2>&1; do
    if [ "$elapsed" -ge "$MAX_WAIT" ]; then
      fail "${name} not reachable at ${url} within ${MAX_WAIT}s"
      echo "---- docker compose ps ----"
      docker compose ps
      echo "---- ${service} logs (tail, read-only) ----"
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

echo "---- docker compose ps ----"
docker compose ps

echo "=============================================="
pass "DOCKER STACK HEALTHY"
info "Containers are still running. This script does not stop or remove them."
info "Stopping/removing containers is a manual user decision only."
echo "=============================================="
