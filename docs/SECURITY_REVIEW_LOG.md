# Security Review Log

Human-readable log of security findings, accepted risks, and patches applied.
Every entry referenced from `.security-accepted-risks` must have a matching
entry here.

---

## DEV-FOUNDATION-001 — 2026-07-22

### Findings resolved during foundation build (no accepted-risk entries needed)

While setting up the npm workspace, `npm install` initially surfaced 26
vulnerabilities (7 HIGH, 1 CRITICAL) transitively pulled in by pinning
`@nestjs/*` to the 10.x line and `vitest` to the 2.x line. All were resolved
by patching to current stable majors rather than accepting risk:

- `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`,
  `@nestjs/testing` bumped `^10.4.6` → `^11.1.28`
- `@nestjs/cli` bumped `^10.4.9` → `^11.0.24`
- `vitest` bumped `^2.1.4` → `^4.1.10` across all five `packages/*` workspaces
- Remaining 3 findings (`ajv`, `picomatch`, `qs` — all transitive) cleared by
  `npm audit fix` (no `--force`, no breaking changes)

Result: `npm audit` — **0 vulnerabilities** as of the DEV-FOUNDATION-001
build.

### Next.js internal `sharp`/`postcss` — resolved via `overrides`, no accepted-risk needed

`next@16.2.11` bundles its own internal copies of `sharp` (image
optimization) and `postcss` (CSS processing) as transitive dependencies.
The versions Next.js pinned internally (`sharp@0.34.5`, `postcss@8.4.31`)
had known HIGH (`sharp`, libvips CVEs) and MODERATE (`postcss`, XSS via
unescaped `</style>`) advisories. `npm audit fix --force` would have
downgraded `next` to `9.3.3` — not viable.

Fixed instead via root `package.json` `overrides`:
```json
"overrides": { "sharp": "^0.35.3", "postcss": "^8.5.21" }
```
This forces the whole dependency tree (including Next's internal copies) to
patched versions without downgrading Next itself. Verified via
`npm ls sharp postcss` showing the overridden versions deduped throughout
the tree, and `npm audit` reporting 0 vulnerabilities afterward.

**No entries in `.security-accepted-risks` were required for
DEV-FOUNDATION-001** — every HIGH/CRITICAL finding was patched, not
accepted.

---

## DEV-FOUNDATION-002 — 2026-07-22

### Prisma / @prisma/client added — no HIGH/CRITICAL findings

Added `prisma` and `@prisma/client`, both pinned to the exact version
`6.19.3` in `package-lock.json`. `npm audit` after install: **0
vulnerabilities**. No `.security-accepted-risks` entry required.

### Identity/Role schema — no credential material introduced

The new `User`/`Role`/`UserRoleAssignment` Prisma models carry no
password/hash/token/session field, and `prisma/seed.ts` never creates a
default User or any credential. Verified via `scripts/db-verify.sh`
(`SELECT count(*) FROM users` = 0 after migration + seed).

### Readiness endpoint (`GET /health/ready`, and `GET /health` alias) — error detail is server-log-only

`HealthService.getReadiness()` logs the underlying database error
server-side (`Logger.error`) but throws a generic
`ServiceUnavailableException("Service unavailable")` to the client on
failure — no host, credential, or SQL detail reaches the HTTP response.
Covered by `src/health/health.service.spec.ts` (asserts the serialized
exception response never matches `password|host|DATABASE_URL`-shaped
strings).

### Secret scan — WARN on `DATABASE_URL` string occurrences (expected, not a finding)

`scripts/secret-scan.sh` Phase 3 flags `DATABASE_URL` as a WARN pattern
requiring manual review. Reviewed: every occurrence in this change is the
literal variable name in a comment or test assertion (e.g. "does not log
DATABASE_URL", `.not.toMatch(/.../DATABASE_URL/i)`) — no real connection
string or credential value is present anywhere in source control. No
`.security-accepted-risks` entry needed (WARN, not FAIL).

**No entries in `.security-accepted-risks` were required for
DEV-FOUNDATION-002** — no HIGH/CRITICAL finding, accepted or otherwise.

---

<!-- Future accepted-risk entries go below this line, in the format described
     in docs/SECURITY_PATCH_POLICY.md -->
