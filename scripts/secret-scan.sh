#!/usr/bin/env bash
set -euo pipefail

# secret-scan.sh — scan source files for likely committed secrets.
#
# WHAT IT CHECKS:
#   Phase 1 — Committed .env files tracked by git (not .env.example)
#   Phase 2 — PEM private key blocks in source files
#   Phase 3 — Suspicious patterns in source files with placeholder filtering
#
# WHAT IT DOES NOT CHECK:
#   - Binary files, generated assets, or compiled output
#   - Historical secrets in git history (use truffleHog or git-secrets for that)
#   - Secrets passed only at runtime through environment variables
#
# KNOWN LIMITATIONS:
#   - Placeholder filtering is keyword-based; unusual placeholder patterns may
#     not be caught and could produce false negatives.
#   - This script is a lightweight local check. It does NOT replace GitGuardian,
#     truffleHog, or git-secrets for a full historical scan.
#
# FAIL conditions: committed .env files, PEM key blocks in source.
# WARN conditions: suspicious patterns in source files (require manual review).

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

pass() { printf '\033[0;32m[PASS]\033[0m %s\n' "$1"; }
warn() { printf '\033[0;33m[WARN]\033[0m %s\n' "$1"; }
info() { printf '\033[0;34m[....]\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31m[FAIL]\033[0m %s\n' "$1" >&2; }

SCAN_FAILURES=0
SCAN_WARNINGS=0

echo "=============================================="
echo " Dispatch — Secret Scan"
echo "=============================================="

# ── Placeholder / safe-value regex (grep -E compatible) ────────────────────────
# Lines matching these are considered intentional placeholders, not real secrets.
PLACEHOLDER_REGEX='CHANGE_ME|CHANGE_THIS|your-secret|change-me|placeholder|REPLACE_ME|YOUR_SECRET|YOUR_KEY|process\.env\.|getenv|os\.environ|STRONG_RANDOM|test-secret|mock\.jwt|mock\.|fake\.|stub\.|example\.com|localhost|not set|environment variable|fromEnvVar|env\('

# ── grep helper: scan source files, excluding generated/vendor dirs and docs ───
grep_source() {
  local pattern="$1"
  grep -rn \
    --include="*.ts" --include="*.tsx" \
    --include="*.js" --include="*.jsx" \
    --include="*.mjs" --include="*.cjs" \
    --exclude-dir=".git" \
    --exclude-dir="node_modules" \
    --exclude-dir="dist" \
    --exclude-dir="build" \
    --exclude-dir=".next" \
    --exclude-dir="coverage" \
    --exclude-dir="playwright-report" \
    --exclude-dir="test-results" \
    --exclude="*.env.example" \
    --exclude="secret-scan.sh" \
    "$pattern" "$ROOT" 2>/dev/null \
    | grep -v -E "docs/|CLAUDE\.md|README\.md|Dispatch Knowledge/" \
    || true
}

# ─────────────────────────────────────────────────────────────────────────────
# Phase 1 — Committed .env files
# ─────────────────────────────────────────────────────────────────────────────
info "Phase 1: Checking for committed .env files..."

COMMITTED_ENVS=$(git -C "$ROOT" ls-files \
  | grep -E '(^|/)\.(env)(\.|$)' \
  | grep -v '\.env\.example$' \
  || true)

if [ -n "$COMMITTED_ENVS" ]; then
  fail "Committed .env file(s) found — may contain real secrets:"
  echo "$COMMITTED_ENVS" | while IFS= read -r f; do echo "  FAIL: $f"; done
  SCAN_FAILURES=$((SCAN_FAILURES + 1))
else
  pass "No committed .env files found"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Phase 2 — PEM private key blocks
# ─────────────────────────────────────────────────────────────────────────────
info "Phase 2: Scanning for PEM private key blocks..."

PEM_FINDINGS=$(find "$ROOT" \
  \( -name ".git" -o -name "node_modules" -o -name "dist" -o -name "build" \
     -o -name ".next" -o -name "coverage" \) -prune \
  -o -type f \
  \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \
     -o -name "*.json" -o -name "*.yml" -o -name "*.yaml" \
     -o -name "*.pem" -o -name "*.key" -o -name "*.crt" \) -print \
  | xargs grep -l "BEGIN.*PRIVATE KEY\|BEGIN RSA PRIVATE\|BEGIN EC PRIVATE\|BEGIN OPENSSH PRIVATE" 2>/dev/null \
  || true)

if [ -n "$PEM_FINDINGS" ]; then
  fail "PEM private key block found in source file(s):"
  echo "$PEM_FINDINGS" | while IFS= read -r f; do echo "  FAIL: $f"; done
  SCAN_FAILURES=$((SCAN_FAILURES + 1))
else
  pass "No PEM private key blocks found"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Phase 3 — Suspicious patterns in source files
# ─────────────────────────────────────────────────────────────────────────────
info "Phase 3: Scanning source files for suspicious patterns..."

check_pattern() {
  local pattern="$1"
  local label="$2"

  local raw
  raw=$(grep_source "$pattern" || true)

  local findings
  findings=$(echo "$raw" | grep -v -E "$PLACEHOLDER_REGEX" || true)

  if [ -n "$findings" ]; then
    warn "$label — manual review required:"
    echo "$findings" | head -10
    echo "  (showing up to 10 lines; grep '$pattern' for full results)"
    SCAN_WARNINGS=$((SCAN_WARNINGS + 1))
    return 0
  fi
}

check_pattern "JWT_SECRET"        "JWT_SECRET in source"
check_pattern "DATABASE_URL"      "DATABASE_URL in source"
check_pattern "POSTGRES_PASSWORD" "POSTGRES_PASSWORD in source"
check_pattern "PRIVATE_KEY"       "PRIVATE_KEY in source"
check_pattern "serviceAccountKey" "serviceAccountKey in source"
check_pattern "clientSecret"      "clientSecret in source"
check_pattern "secretKey"         "secretKey in source"
check_pattern "apiKey"            "apiKey in source"

# NOTE: accessToken / refreshToken are Dispatch's future AUTH-001 vocabulary
# (Topic 11 §5.7, PO-authorized JWT direction) and are intentionally NOT
# scanned at WARN level — no such code exists yet in DEV-FOUNDATION-001, and
# once AUTH-001 lands they will be legitimate variable names, not secrets.

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
echo "=============================================="

if [ "$SCAN_FAILURES" -eq 0 ] && [ "$SCAN_WARNINGS" -eq 0 ]; then
  pass "Secret scan completed — no findings"
elif [ "$SCAN_FAILURES" -eq 0 ]; then
  warn "Secret scan completed — $SCAN_WARNINGS warning(s) require manual review"
  pass "No automatic FAIL conditions triggered"
else
  fail "Secret scan FAILED — $SCAN_FAILURES failure(s), $SCAN_WARNINGS warning(s)"
fi

echo "=============================================="
exit "$SCAN_FAILURES"
