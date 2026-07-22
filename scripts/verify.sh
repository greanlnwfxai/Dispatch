#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# verify.sh — local foundation verification (DEV-FOUNDATION-001)
#   1. npm workspace dependency consistency (npm ls, non-mutating)
#   2. lint (all workspaces)
#   3. typecheck (all workspaces)
#   4. unit/foundation tests (all workspaces)
#   5. build (packages/*, then apps/api, apps/admin-web, apps/mobile-pwa)
#   6. docker compose config validation (no containers started)
# Exits non-zero on the first failure.
# ─────────────────────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

pass() { printf '\033[0;32m[PASS]\033[0m %s\n' "$1"; }
info() { printf '\033[0;34m[....]\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31m[FAIL]\033[0m %s\n' "$1" >&2; }

trap 'fail "verify.sh failed (line $LINENO)"' ERR

echo "=============================================="
echo " Dispatch — Local Verify (DEV-FOUNDATION-001)"
echo "=============================================="

info "Checking npm workspace dependency consistency..."
npm ls --workspaces --omit=dev >/dev/null 2>&1 || npm ls --workspaces >/dev/null
pass "Workspace dependency tree resolves"

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

echo "=============================================="
pass "ALL CHECKS PASSED"
echo "=============================================="
