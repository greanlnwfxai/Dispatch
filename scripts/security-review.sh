#!/usr/bin/env bash
set -euo pipefail

# security-review.sh — combined security review runner (DEV-FOUNDATION-001).
#
# Runs:
#   1. scripts/security-audit.sh  — dependency vulnerability audit
#   2. scripts/secret-scan.sh     — secret / sensitive-value scan
#   3. Docker safety/config checks (docker compose config + destructive-
#      command guard across all harness scripts)
#
# Then prints a manual review reminder checklist.
# Does NOT mutate files, run npm audit fix, or touch running containers.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

pass() { printf '\033[0;32m[PASS]\033[0m %s\n' "$1"; }
info() { printf '\033[0;34m[....]\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31m[FAIL]\033[0m %s\n' "$1" >&2; }
section() { echo ""; echo "══════════════════════════════════════════════"; echo " $1"; echo "══════════════════════════════════════════════"; }

AUDIT_STATUS=0
SCAN_STATUS=0
DOCKER_STATUS=0

section "Dispatch — Security Review"
echo " Full docs: docs/SECURITY_HARNESS.md"
echo " Checklist: docs/SECURITY_REVIEW_CHECKLIST.md"
echo " Policy:    docs/SECURITY_PATCH_POLICY.md"

# ── 1. Dependency Audit ────────────────────────────────────────────────────────
section "Step 1 — Dependency Vulnerability Audit"
"$ROOT/scripts/security-audit.sh" || AUDIT_STATUS=$?

# ── 2. Secret Scan ─────────────────────────────────────────────────────────────
section "Step 2 — Secret Scan"
"$ROOT/scripts/secret-scan.sh" || SCAN_STATUS=$?

# ── 3. Docker safety/config checks ─────────────────────────────────────────────
section "Step 3 — Docker Safety and Config Checks"

info "Validating docker compose config..."
if docker compose config >/dev/null 2>&1; then
  pass "docker compose config valid"
else
  fail "docker compose config failed to validate"
  DOCKER_STATUS=1
fi

info "Scanning harness scripts for destructive Docker commands..."
FORBIDDEN_PATTERN='docker[[:space:]]+compose[[:space:]]+down|docker[[:space:]]+system[[:space:]]+prune|docker[[:space:]]+volume[[:space:]]+rm|docker[[:space:]]+container[[:space:]]+rm|docker[[:space:]]+image[[:space:]]+rm|docker[[:space:]]+network[[:space:]]+rm'
DESTRUCTIVE_FOUND=0
for f in "$ROOT"/scripts/*.sh; do
  if grep -vE '^[[:space:]]*#' "$f" | grep -Eq "$FORBIDDEN_PATTERN"; then
    fail "Destructive Docker command found in $(basename "$f")"
    DESTRUCTIVE_FOUND=1
  fi
done
if [ "$DESTRUCTIVE_FOUND" -eq 0 ]; then
  pass "No destructive Docker commands found in scripts/*.sh"
else
  DOCKER_STATUS=1
fi

# ── 4. Manual Review Reminder ──────────────────────────────────────────────────
section "Step 4 — Manual Review Checklist (NOT automated)"
echo ""
echo "The following items require human review. See docs/SECURITY_REVIEW_CHECKLIST.md"
echo "for full checklists and acceptance criteria."
echo ""
echo "  [ ] Auth — login/refresh/logout endpoints return generic errors, never reveal loginId existence"
echo "  [ ] RBAC — RolesGuard resolves roles from PostgreSQL per-request, never trusts JWT/client role claims"
echo "  [ ] Data privacy — GET /health exposes no PII, no secrets, only status+service"
echo "  [ ] Token security — refresh tokens are opaque+hashed, never returned in JSON, never logged"
echo "  [ ] Logging — no secrets, passwords, or tokens in log output"
echo "  [ ] Error handling — no stack traces or DB schema exposed in production"
echo "  [ ] Dependency advisories — check npm advisories for any newly added packages"
echo "  [ ] Docker safety — non-root containers, no privileged mode, no destructive commands"
echo ""
echo "Full checklist: docs/SECURITY_REVIEW_CHECKLIST.md"

# ── Summary ────────────────────────────────────────────────────────────────────
section "Security Review Summary"

OVERALL=0
[ "$AUDIT_STATUS" -ne 0 ] && OVERALL=1
[ "$SCAN_STATUS"  -ne 0 ] && OVERALL=1
[ "$DOCKER_STATUS" -ne 0 ] && OVERALL=1

if [ "$OVERALL" -eq 0 ]; then
  pass "SECURITY REVIEW PASSED — automated checks clear"
  echo ""
  echo "Reminder: manual checklist items above still require human sign-off."
else
  fail "SECURITY REVIEW FAILED — see findings above"
  echo ""
  echo "Resolve all FAIL items before marking this task PASS."
  echo "See docs/SECURITY_PATCH_POLICY.md for patch guidance."
fi

echo "══════════════════════════════════════════════"
exit "$OVERALL"
