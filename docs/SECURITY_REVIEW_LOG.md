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

## AUTH-001 — 2026-07-22

### New dependencies (`@nestjs/jwt`, `@nestjs/throttler`, `cookie-parser`, `@node-rs/argon2`) — no HIGH/CRITICAL findings

All four exact-pinned in `apps/api/package.json`. `npm audit` after install:
**0 vulnerabilities**. `@node-rs/argon2` (not `argon2`) was chosen because it
ships prebuilt native bindings for `linux-x64-musl`/`linux-arm64-musl`
(the API's Alpine production image) as well as `darwin-arm64` (local dev) —
avoiding a native `node-gyp` build step in the Docker image. No
`.security-accepted-risks` entry required.

### Refresh-token hashing uses SHA-256, not Argon2id — intentional, not a weakened control

Passwords use Argon2id (slow, memory-hard) because human-chosen secrets have
limited entropy and must resist offline brute-force. Refresh-token secrets
are library-generated with 256 bits of entropy (`crypto.randomBytes(32)`)
— brute-forcing is already computationally infeasible, so a fast
cryptographic hash (SHA-256) is the correct, standard choice; using Argon2id
here would only add unnecessary latency per refresh with no security
benefit. See `RefreshTokenService` doc comment.

### Accidental secret exposure in this session's tool output — remediated by rotation, not by an accepted-risk entry

While verifying the `docker-compose.yml` wiring, a command printed the real
local-development `JWT_ACCESS_SECRET` and the pre-existing
`POSTGRES_PASSWORD` embedded in the rendered `DATABASE_URL` into this
session's tool output. No value was committed to Git, but both values were
treated as exposed.

Remediation completed:

- `JWT_ACCESS_SECRET` was regenerated; the replacement value was never printed.
- The PostgreSQL password for role `dispatch_user` was rotated interactively
  through `psql` without printing the value.
- TCP password authentication using the replacement PostgreSQL credential
  succeeded.
- The ignored local `.env` was updated to the replacement value and retained
  permission mode `600`.
- `dispatch-db` and `dispatch-api` were recreated non-destructively with
  `docker compose up -d --force-recreate db api`; the existing PostgreSQL
  volume was preserved.
- Both containers returned `healthy`; `GET /health/ready` returned database
  status `ok`; Prisma reported both committed migrations applied and the
  schema up to date.
- The temporary secret file was removed, its environment-variable reference
  was unset, and the clipboard was cleared.
- No Git-tracked secret, password, token, hash, or connection string was added.

All subsequent Compose checks were presence-only or redacted. This incident
was remediated through credential rotation and therefore requires no
accepted-risk entry.

### Auth database integration/e2e tests — verified clean residue

`apps/api/test/auth.integration-spec.ts` and `apps/api/test/auth.e2e-spec.ts`
create only uniquely-scoped test Users/AuthSessions/RefreshTokenRecords and
delete exactly those rows in `afterAll`. Verified via direct `psql` counts
after a full local test run: `users`=0, `auth_sessions`=0,
`refresh_token_records`=0, `roles`=6 — no residue, no impact on the six
seeded system roles.

**No entries in `.security-accepted-risks` were required for AUTH-001** — no
HIGH/CRITICAL finding, accepted or otherwise.

---

<!-- Future accepted-risk entries go below this line, in the format described
     in docs/SECURITY_PATCH_POLICY.md -->
