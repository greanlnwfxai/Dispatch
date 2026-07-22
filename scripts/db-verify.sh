#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# db-verify.sh — database verification harness (DEV-FOUNDATION-002,
# NON-DESTRUCTIVE)
#
#   1. validate docker compose config
#   2. confirm `db` is healthy and `api` is running
#   3. run `prisma migrate status` (through the running `api` container —
#      PostgreSQL has no host port mapping, so migration/seed commands run
#      inside the Docker network, never against an exposed port)
#   4. apply committed migrations with `prisma migrate deploy`
#   5. run the idempotent system-role seed (`prisma db seed`)
#   6. verify database connectivity, the migration name, the exact six
#      approved role codes, and that no default User exists (read-only
#      psql queries, no credentials printed)
#   7. run the database integration test suite in a throwaway build-stage
#      container attached to the same Docker network (a "safe dedicated
#      mechanism" distinct from the running production `api` image, so
#      devDependencies/test sources never ship in the production image)
#   8. leave all services (and the throwaway test container, which is
#      --rm'd after it exits) running/cleaned up as appropriate
#
# SAFETY RULES (do not violate):
#   - Never drop, reset, or truncate a database.
#   - Never delete unknown records — only this script's own throwaway test
#     container is removed (--rm); `db` and `api` are left running.
#   - Never run `docker compose down`, `prisma migrate reset`, or any
#     volume/container/image/network removal command.
#   - Never print DATABASE_URL, POSTGRES_PASSWORD, or any credential.
# ─────────────────────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Load POSTGRES_* values from .env (if present) into this script's own shell
# environment only — never echoed, never passed to any command that prints
# it back. Needed to build DATABASE_URL for the throwaway test-runner
# container below. CI provides these as job-level env vars instead.
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

pass() { printf '\033[0;32m[PASS]\033[0m %s\n' "$1"; }
info() { printf '\033[0;34m[....]\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31m[FAIL]\033[0m %s\n' "$1" >&2; }

trap 'fail "db-verify.sh failed (line $LINENO) — containers were left running for inspection"' ERR

# ── Safety guard ──────────────────────────────────────────────────────────────
SELF="${BASH_SOURCE[0]}"
FORBIDDEN_PATTERN='docker[[:space:]]+compose[[:space:]]+down|docker[[:space:]]+system[[:space:]]+prune|docker[[:space:]]+volume[[:space:]]+rm|docker[[:space:]]+container[[:space:]]+rm|docker[[:space:]]+image[[:space:]]+rm|docker[[:space:]]+network[[:space:]]+rm|prisma[[:space:]]+migrate[[:space:]]+reset'
if grep -vE '^[[:space:]]*#' "$SELF" | grep -v 'FORBIDDEN_PATTERN=' | grep -Eq "$FORBIDDEN_PATTERN"; then
  fail "Safety guard tripped: a destructive command was found in $(basename "$SELF"). Refusing to run."
  exit 1
fi

echo "=============================================="
echo " Dispatch — Database Verify (non-destructive)"
echo "=============================================="
info "This script does not drop, reset, or truncate any database, and does"
info "not stop or remove the db/api containers. DATABASE_URL and credentials"
info "are never printed."

# ── 1. Compose config ─────────────────────────────────────────────────────────
info "Validating docker compose config..."
docker compose config >/dev/null
pass "docker compose config valid"

# ── 2. db healthy, api running ────────────────────────────────────────────────
info "Confirming db is healthy..."
DB_STATUS="$(docker inspect -f '{{.State.Health.Status}}' dispatch-db 2>/dev/null || echo "not-found")"
if [ "$DB_STATUS" != "healthy" ]; then
  fail "dispatch-db is not healthy (status: ${DB_STATUS}). Run ./scripts/docker-verify.sh first."
  exit 1
fi
pass "db healthy"

info "Confirming api is running..."
API_STATUS="$(docker inspect -f '{{.State.Status}}' dispatch-api 2>/dev/null || echo "not-found")"
if [ "$API_STATUS" != "running" ]; then
  fail "dispatch-api is not running (status: ${API_STATUS}). Run ./scripts/docker-verify.sh first."
  exit 1
fi
pass "api running"

# ── 3-5. Prisma migrate status / deploy / seed — through the api container ──
# `prisma migrate status` exits non-zero when migrations are pending, which
# is the expected/normal state on a fresh database before `migrate deploy`
# runs below — so its exit code is informational here, not fatal.
info "Running 'prisma migrate status' inside the api container..."
docker compose exec -T api npx prisma migrate status || true
pass "Migration status checked"

info "Applying committed migrations with 'prisma migrate deploy' inside the api container..."
docker compose exec -T api npx prisma migrate deploy
pass "Migrations deployed"

info "Running the idempotent system-role seed ('prisma db seed') inside the api container..."
docker compose exec -T api npx prisma db seed
pass "System-role seed complete"

# ── 6. Read-only database inspection (no credentials printed) ───────────────
info "Verifying database connectivity..."
docker compose exec -T db psql -U "${POSTGRES_USER:-dispatch_user}" -d "${POSTGRES_DB:-dispatch}" -c "SELECT 1;" >/dev/null
pass "Database connectivity confirmed"

info "Verifying the identity/role migration is applied..."
MIGRATION_NAMES="$(docker compose exec -T db psql -U "${POSTGRES_USER:-dispatch_user}" -d "${POSTGRES_DB:-dispatch}" -tA -c "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY started_at;")"
if [ -z "$MIGRATION_NAMES" ]; then
  fail "No applied migrations found in _prisma_migrations"
  exit 1
fi
pass "Applied migration(s):"
echo "$MIGRATION_NAMES" | sed 's/^/    - /'

info "Verifying exactly the six approved role codes exist..."
ROLE_COUNT="$(docker compose exec -T db psql -U "${POSTGRES_USER:-dispatch_user}" -d "${POSTGRES_DB:-dispatch}" -tA -c "SELECT count(*) FROM roles;" | tr -d '[:space:]')"
if [ "$ROLE_COUNT" != "6" ]; then
  fail "Expected exactly 6 roles, found ${ROLE_COUNT}"
  exit 1
fi
ROLE_CODES="$(docker compose exec -T db psql -U "${POSTGRES_USER:-dispatch_user}" -d "${POSTGRES_DB:-dispatch}" -tA -c "SELECT code FROM roles ORDER BY code;")"
pass "Exactly 6 roles present:"
echo "$ROLE_CODES" | sed 's/^/    - /'

EXPECTED_ROLE_CODES="ADMIN
DISPATCHER
INTERNAL_DELIVERY_EMPLOYEE
MANAGEMENT_AUDITOR
STOCK
SUPER_ADMIN"
if [ "$(echo "$ROLE_CODES" | sort)" != "$(echo "$EXPECTED_ROLE_CODES" | sort)" ]; then
  fail "Seeded role codes do not match the approved set"
  exit 1
fi
pass "Seeded role codes match the approved set exactly"

info "Verifying no default User was created..."
USER_COUNT="$(docker compose exec -T db psql -U "${POSTGRES_USER:-dispatch_user}" -d "${POSTGRES_DB:-dispatch}" -tA -c "SELECT count(*) FROM users;" | tr -d '[:space:]')"
if [ "$USER_COUNT" != "0" ]; then
  fail "Expected 0 Users (no default account), found ${USER_COUNT}"
  exit 1
fi
pass "No default User exists (0 rows in users)"

info "Verifying AUTH-001 auth_sessions/refresh_token_records tables exist..."
AUTH_TABLE_COUNT="$(docker compose exec -T db psql -U "${POSTGRES_USER:-dispatch_user}" -d "${POSTGRES_DB:-dispatch}" -tA -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('auth_sessions','refresh_token_records');" | tr -d '[:space:]')"
if [ "$AUTH_TABLE_COUNT" != "2" ]; then
  fail "Expected both auth_sessions and refresh_token_records tables to exist, found ${AUTH_TABLE_COUNT}/2"
  exit 1
fi
pass "auth_sessions and refresh_token_records tables exist"

# ── 7. Database integration tests ────────────────────────────────────────────
# Run in a throwaway container built from the Dockerfile's "builder" stage
# (has devDependencies, ts-jest, and raw test/ sources — the production
# runtime image intentionally does not). Removed automatically (--rm) after
# the test run; the running db/api services are untouched.
info "Building the test-runner image (Dockerfile 'builder' stage, cached after first run)..."
docker build --target builder -f apps/api/Dockerfile -t dispatch-api-test-runner:latest . >/dev/null
pass "Test-runner image ready"

info "Running database integration tests (apps/api: test:integration, test:e2e — includes AUTH-001 auth.integration-spec/auth.e2e-spec)..."
docker run --rm \
  --network dispatch_default \
  -e DATABASE_URL="postgresql://${POSTGRES_USER:-dispatch_user}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-dispatch}?schema=public" \
  -e JWT_ACCESS_SECRET="db-verify-test-only-jwt-access-secret-not-a-real-secret" \
  -e AUTH_LOGIN_RATE_LIMIT="1000:60" \
  -e AUTH_REFRESH_RATE_LIMIT="1000:60" \
  -w /repo/apps/api \
  dispatch-api-test-runner:latest \
  sh -c "npm run test:integration && npm run test:e2e"
pass "Database integration tests passed"

info "Verifying test suites left no residual session/refresh-token rows..."
SESSION_COUNT="$(docker compose exec -T db psql -U "${POSTGRES_USER:-dispatch_user}" -d "${POSTGRES_DB:-dispatch}" -tA -c "SELECT count(*) FROM auth_sessions;" | tr -d '[:space:]')"
TOKEN_COUNT="$(docker compose exec -T db psql -U "${POSTGRES_USER:-dispatch_user}" -d "${POSTGRES_DB:-dispatch}" -tA -c "SELECT count(*) FROM refresh_token_records;" | tr -d '[:space:]')"
if [ "$SESSION_COUNT" != "0" ] || [ "$TOKEN_COUNT" != "0" ]; then
  fail "Expected 0 residual sessions/refresh tokens after test cleanup, found ${SESSION_COUNT} session(s), ${TOKEN_COUNT} token(s)"
  exit 1
fi
pass "No residual test sessions or refresh-token records (0/0)"

info "Re-confirming no default User exists after the test suite ran..."
POST_TEST_USER_COUNT="$(docker compose exec -T db psql -U "${POSTGRES_USER:-dispatch_user}" -d "${POSTGRES_DB:-dispatch}" -tA -c "SELECT count(*) FROM users;" | tr -d '[:space:]')"
if [ "$POST_TEST_USER_COUNT" != "0" ]; then
  fail "Expected 0 Users after test cleanup, found ${POST_TEST_USER_COUNT}"
  exit 1
fi
pass "No residual test Users (0 rows in users)"

# ── Summary ────────────────────────────────────────────────────────────────────
echo "=============================================="
pass "DATABASE VERIFY PASSED"
info "db and api containers are still running. This script did not stop,"
info "remove, drop, reset, or truncate anything."
echo "=============================================="
