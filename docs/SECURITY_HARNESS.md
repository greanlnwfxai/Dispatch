# Security Harness

## Purpose

This document describes the security review harness added in
**DEV-FOUNDATION-001**. The harness provides lightweight, non-destructive
security checks that run locally and in GitHub Actions before any task is
declared PASS. It does NOT replace production-grade tooling such as full
SAST/DAST, historical secret scanning, or external vulnerability
intelligence feeds.

## Scripts Added

| Script | Purpose |
|---|---|
| `scripts/security-audit.sh` | npm dependency audit — single root workspace (all `packages/*` and `apps/*`) |
| `scripts/secret-scan.sh` | Source file secret / sensitive-value scan |
| `scripts/security-review.sh` | Combined runner (audit + secret scan + Docker safety/config checks) + manual checklist reminder |

Dispatch uses npm workspaces with a single root `package-lock.json`, unlike
a multi-repo/multi-lockfile setup — so `security-audit.sh` runs one
workspace-wide `npm audit` rather than per-app audits.

## CI Enforcement

GitHub Actions CI (`.github/workflows/ci.yml`) includes a blocking
`Security — Audit & Secret Scan` job that runs:

```bash
./scripts/security-audit.sh
./scripts/secret-scan.sh
```

CI fails when:

- `scripts/security-audit.sh` finds any HIGH or CRITICAL advisory that is
  not documented in `.security-accepted-risks`
- `scripts/secret-scan.sh` finds likely real committed secrets or private
  keys

Full Docker build/start/health verification (`docker-verify.sh`) and the
Playwright E2E suite are **required local gates**, not CI jobs, in
DEV-FOUNDATION-001 — see `CLAUDE.md` § Required verification commands.

Accepted risks remain transparent and reviewable:

- Machine-readable registry: `.security-accepted-risks`
- Human-readable rationale log: `docs/SECURITY_REVIEW_LOG.md`

### Local Usage

```bash
# Run all automated security checks (recommended before declaring any task PASS)
./scripts/security-review.sh

# Run dependency audit only
./scripts/security-audit.sh

# Run secret scan only
./scripts/secret-scan.sh
```

---

## What Blocks PASS

### security-audit.sh
- Any HIGH or CRITICAL vulnerability anywhere in the workspace dependency tree.
- Patch or document an accepted-risk note (per `docs/SECURITY_PATCH_POLICY.md`) before PASS.

### secret-scan.sh
- Committed `.env` files tracked by git (not `.env.example`).
- PEM private key block found in any source file (`.ts`, `.js`, `.json`, `.yml`, `.pem`, `.key`).

### security-review.sh
- FAIL from either sub-script above, or a `docker compose config` validation failure.

---

## What Does NOT Get Automated Here

- Historical git history scanning (truffleHog, git-secrets)
- External CVE / advisory intelligence feeds
- Automatic dependency patching
- SAST / DAST tooling
- Container image scanning (Trivy, Grype)

These remain future enhancements beyond the current harness.

---

## Known Limitations

1. **Secret scan is keyword-based** — it does not parse AST or understand
   code semantics. Patterns like `apiKey` or `secretKey` may flag legitimate
   variable names. All WARN-level findings require manual review.
2. **No git history scan** — secrets committed in past commits and later
   removed are NOT detected.
3. **Placeholder filtering is not exhaustive** — novel placeholder patterns
   not in `PLACEHOLDER_REGEX` may produce false negatives.
4. **npm audit is local** — reflects the current local lockfile state.
   Results may differ from CI if the lockfile is out of sync.

---

## Foundation Scope Note

AUTH-001 introduces the authentication/RBAC foundation (login, JWT
access/refresh, server-side session/revocation, guards) — the
authentication/RBAC/password-token items in
`docs/SECURITY_REVIEW_CHECKLIST.md` are now applicable and marked PASS.
Business data-model/PII items (customer data, delivery task data) remain
N/A until MVP-02 and later milestones land. Do not mark those items PASS in
this milestone; mark them N/A with the reason.

`scripts/verify.sh` and `scripts/mobile-verify.sh` also carry a static
scan for client-side token-storage writes (`localStorage.setItem`,
`sessionStorage.setItem`, `indexedDB.open`) — scoped to
`apps/admin-web/src`/`apps/mobile-pwa/src`, excluding test files (which
legitimately assert the absence of such writes via read-only
`.length === 0` checks).

---

## Future Security Enhancements

- Wiring `docker-verify.sh` and the Playwright suite into CI once Docker-in-CI
  is proven reliable for this repo
- Container image scanning (Trivy/Grype)
- SAST integration (e.g. CodeQL)
- Historical secret scanning against git history
- Dependabot configuration (`.github/dependabot.yml`) once the dependency
  surface stabilizes past the foundation milestone
