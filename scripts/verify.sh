#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# verify.sh — local foundation verification (DEV-FOUNDATION-002)
#   1. npm workspace dependency consistency (npm ls, non-mutating)
#   2. prepare shared workspace packages (npm run build:packages) — required
#      on a clean checkout because packages/* main/types point at ./dist
#      (gitignored); app typecheck/test resolve those compiled entry points
#   3. Prisma generate + validate (schema-only, no database connection)
#   4. lint (all workspaces)
#   5. typecheck (all workspaces)
#   6. unit/foundation tests (all workspaces)
#   7. build (packages/*, then apps/api, apps/admin-web, apps/mobile-pwa)
#   8. docker compose config validation (no containers started)
# Exits non-zero on the first failure.
#
# This script is fully offline — it never requires a running database.
# Database-aware checks (migration deploy, seed, DB integration tests) live
# in scripts/db-verify.sh instead.
#
# Note: root `npm run typecheck` and `npm run test` also self-prepare via
# `build:packages` (see package.json), so they are correct even when run
# directly, not only through this script.
# ─────────────────────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

pass() { printf '\033[0;32m[PASS]\033[0m %s\n' "$1"; }
info() { printf '\033[0;34m[....]\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31m[FAIL]\033[0m %s\n' "$1" >&2; }

trap 'fail "verify.sh failed (line $LINENO)"' ERR

echo "=============================================="
echo " Dispatch — Local Verify (DEV-FOUNDATION-002)"
echo "=============================================="

info "Checking npm workspace dependency consistency..."
npm ls --workspaces --omit=dev >/dev/null 2>&1 || npm ls --workspaces >/dev/null
pass "Workspace dependency tree resolves"

info "Preparing shared workspace packages (packages/* dist, consumed by app typecheck/test)..."
npm run build:packages
pass "Shared workspace packages prepared"

info "Generating Prisma Client (schema-only, no database connection)..."
npm run prisma:generate --workspace=apps/api
pass "Prisma Client generated"

info "Validating Prisma schema (offline — a placeholder DATABASE_URL is used only to satisfy env() resolution)..."
DATABASE_URL="${DATABASE_URL:-postgresql://dispatch_user:offline_placeholder@localhost:5432/dispatch?schema=public}" \
  npm run prisma:validate --workspace=apps/api
pass "Prisma schema valid"

info "Running lint (all workspaces)..."
npm run lint
pass "Lint"

info "Running typecheck (all workspaces)..."
npm run typecheck
pass "Typecheck"

info "Running unit/foundation tests (all workspaces)..."
npm run test
pass "Unit/foundation tests"

info "Building packages/* then apps/api, apps/admin-web, apps/mobile-pwa..."
npm run build
pass "Build"

info "Validating docker compose config (no containers started)..."
docker compose config >/dev/null
pass "docker compose config valid"

info "Scanning client source for token-storage prohibition (AUTH-001)..."
# Matches actual write calls, not bare mentions — the frontend test suites
# legitimately assert `localStorage.length === 0` (a read) to prove tokens
# are NOT persisted, so a bare-identifier grep would false-positive on the
# tests that guard this exact rule. Excludes test files/dirs and the
# scanner itself.
TOKEN_STORAGE_PATTERN='(localStorage|sessionStorage)\.(setItem|removeItem)\(|indexedDB\.open\('
TOKEN_STORAGE_FINDINGS="$(grep -rnE "$TOKEN_STORAGE_PATTERN" \
  --include="*.ts" --include="*.tsx" \
  --exclude="*.test.ts" --exclude="*.test.tsx" --exclude="*.spec.ts" \
  --exclude-dir="__tests__" --exclude-dir="node_modules" --exclude-dir=".next" \
  --exclude-dir="dist" --exclude-dir="coverage" \
  apps/admin-web/src apps/mobile-pwa/src 2>/dev/null || true)"
if [ -n "$TOKEN_STORAGE_FINDINGS" ]; then
  fail "Found client-side token-storage write(s) — access/refresh tokens must never be persisted to localStorage/sessionStorage/IndexedDB:"
  echo "$TOKEN_STORAGE_FINDINGS"
  exit 1
fi
pass "No client-side localStorage/sessionStorage/IndexedDB token-storage writes found"

echo "=============================================="
pass "ALL CHECKS PASSED"
echo "=============================================="
