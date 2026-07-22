# CTO Summary

## Task
AUTH-001 — Authentication and RBAC Foundation

## Status (PASS / FAIL)
PASS

## Scope
Implement the first complete Authentication and RBAC foundation for
Dispatch: secure login with a neutral `loginId`, short-lived JWT access
tokens, rotating opaque refresh tokens delivered only via an HttpOnly
cookie, server-side session/revocation storage with immediate revocation
and reuse detection, database-resolved RBAC guards, an operator-only
SUPER_ADMIN bootstrap CLI, and minimal login/session shells for Admin Web
and Mobile/PWA. No Dispatch business workflow is implemented.

## Pre-flight Findings
- Git: clean working tree at `8115b25` (tag
  `v0.12.0-dispatch-database-api-foundation`), branch `main`.
- Database state before any change: migration
  `20260722070103_identity_role_foundation` applied; tables `users`,
  `roles`, `user_role_assignments`, `_prisma_migrations` only; exactly 6
  roles (`SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `STOCK`,
  `INTERNAL_DELIVERY_EMPLOYEE`, `MANAGEMENT_AUDITOR`); **0 Users**. No
  unexpected migrations, tables, or credential implementation — safe to
  proceed.
- No existing credential/session code anywhere in `apps/api`.
- Existing ValidationPipe (`whitelist/transform/forbidNonWhitelisted`) and
  CORS were already configured for DTOs; no CORS/cookie handling existed
  before this task.
- Topic 11 confirmed no contradiction: TDR-AUTH-001 already `APPROVED`
  (JWT access + rotating refresh + server-side revocation, superseding
  §5.7's session-based recommendation), loginId neutrality and
  User-to-Role cardinality neutrality both explicitly recorded as
  AUTH-001's boundary to resolve technically, not a Business Decision.

### Neutral loginId decision
`loginId` is stored only as `User.loginIdNormalized` (nullable, unique,
`VARCHAR(320)`) — normalized by trim + lowercase. Never validated as an
email, never named `email`/`employeeNumber` in schema or code. No
password-recovery or email-delivery assumption introduced.

### User-to-Role cardinality treatment
Unchanged from DEV-FOUNDATION-002: `UserRoleAssignment` remains
cardinality-neutral. `PrismaUserRoleAssignmentRepository.listRoleCodesForUser`
reads however many role codes are assigned (zero, one, or several) and
`AuthService`/`JwtAuthenticationGuard` never assume exactly one. No new BDR
created; no role-assignment CRUD endpoint added.

## Dependencies and Exact Versions
| Package | Version | Why |
|---|---|---|
| `@nestjs/jwt` | `11.0.2` | JWT access-token signing/verification |
| `@nestjs/throttler` | `6.5.0` | Login/refresh rate limiting |
| `cookie-parser` | `1.4.7` (+ `@types/cookie-parser` `1.4.10`) | Reads the HttpOnly refresh cookie |
| `@node-rs/argon2` | `2.0.2` | Argon2id password hashing — chosen over `argon2` because it ships prebuilt native bindings for `linux-x64-musl`/`linux-arm64-musl` (the API's Alpine production image) and `darwin-arm64` (local dev), avoiding a `node-gyp` build step in Docker |

No `passport`/`passport-jwt`/`@nestjs/passport` were installed — guards are
plain custom NestJS guards (`JwtAuthenticationGuard`, `RolesGuard`), which
keeps principal resolution unambiguously database-driven rather than
fighting passport's "trust the decoded payload" default shape. `npm audit`
after install: **0 vulnerabilities**.

## Schema Changes
`apps/api/prisma/schema.prisma` — additive only:

| Model/Field | Table/Column | Notes |
|---|---|---|
| `User.loginIdNormalized` | `login_id_normalized` | nullable, unique, `VARCHAR(320)` |
| `User.passwordHash` | `password_hash` | nullable, `VARCHAR(255)` — Argon2id PHC string, never plaintext |
| `User.credentialsEnabled` | `credentials_enabled` | `BOOLEAN NOT NULL DEFAULT false` |
| `User.credentialsUpdatedAt` | `credentials_updated_at` | nullable `timestamptz(6)` |
| `AuthSession` (new) | `auth_sessions` | `id`, `user_id` (FK, `onDelete: Restrict`), `created_at`, `last_seen_at`, `expires_at` (absolute cap), `revoked_at`, `revoked_reason`; indexed on `user_id` and `(user_id, revoked_at, expires_at)` |
| `RefreshTokenRecord` (new) | `refresh_token_records` | `id`, `session_id` (FK, `onDelete: Restrict`), `token_hash` (unique, SHA-256 hex), `created_at`, `expires_at`, `used_at`, `revoked_at`, `replaced_by_token_id` (self-relation, unique, `onDelete: SetNull`); indexed on `session_id` |

No Prisma `Role` enum added (role codes remain the `@dispatch/shared-types`
runtime constant). No Audit Log table. No password hint, recovery answer,
or raw token ever persisted.

## Migration
`apps/api/prisma/migrations/20260722105124_authentication_session_foundation/migration.sql`,
generated offline via `prisma migrate diff --from-schema-datamodel
<prior-schema> --to-schema-datamodel prisma/schema.prisma --script` (no
shadow database required). Contains only `ALTER TABLE ... ADD COLUMN`,
`CREATE TABLE`, `CREATE INDEX`, and `ADD CONSTRAINT` statements — zero
drops, zero renames. Applied via `prisma migrate deploy` against the real
local database (confirmed empty of Users beforehand); DEV-FOUNDATION-002's
migration was never touched.

## Password Security
Argon2id via `@node-rs/argon2` — explicit `algorithm`, `memoryCost: 19456`
(≈19 MiB), `timeCost: 2`, `parallelism: 1` (OWASP-recommended baseline).
Salt is library-generated. Policy: 12–128 characters, no forced
composition rule. Login burns comparable Argon2 time against a fixed dummy
hash when no matching user/credential exists, reducing (not eliminating) a
loginId-existence timing side channel. Bootstrap CLI enforces the same
policy via a shared `validatePasswordPolicy` function.

## Access Token Design
HS256 JWT, `JWT_ACCESS_SECRET` (required, ≥32 chars, no weak fallback —
`loadAuthConfig()` throws at startup if absent/short). Default 900s (15
min) TTL, configurable issuer/audience. Claims: `sub` (User ID), `sid`
(AuthSession ID), `jti` (unique per token), `iat`/`exp`/`iss`/`aud` — no
loginId, displayName, role claims, or other PII. `JwtAuthenticationGuard`
verifies signature/issuer/audience/expiry, then **always** re-resolves the
principal from PostgreSQL (session not revoked/expired, user active,
credentials enabled, current role codes) — JWT claims are never the
authorization source.

## Refresh Token Rotation
Opaque format `<tokenRecordId>.<secret>` — `secret` is
`crypto.randomBytes(32)` (256 bits) base64url-encoded; only
`sha256(secret)` is ever persisted (`RefreshTokenService`). Delivered
exclusively via the `dispatch_refresh_token` HttpOnly cookie, never in a
JSON body. Rotation is atomic: `PrismaSessionRepository.rotateRefreshToken`
runs a transaction with a conditional `updateMany({ id, usedAt: null,
revokedAt: null })` — a single UPDATE statement Postgres row-locks, so two
concurrent rotation attempts against the same token can never both
succeed. Verified directly: a `Promise.all` of two simultaneous
`rotateRefreshToken` calls against the same token always yields exactly
one non-null result (`auth.integration-spec.ts`).

## Reuse-Detection Behavior
- Presenting an already-**used** or already-**revoked** token →
  `AuthService.refresh` immediately revokes the owning session
  (`refresh_token_reuse`) and returns the generic 401.
- Losing the atomic-rotation race (`rotateRefreshToken` returns `null`) is
  treated identically — session revoked (`refresh_token_concurrent_reuse`),
  generic 401 — so a double-spend can never mint two valid replacements.
- A merely **expired** (never used/revoked) token returns a generic 401
  without forcing a session revoke.
- Verified end-to-end via `auth.e2e-spec.ts`: after one legitimate refresh,
  the pre-rotation cookie is rejected, **and** the freshly-rotated cookie
  is also dead (session-wide revocation), not just the reused one.

## Session and Revocation Behavior
`AuthSession.expiresAt` is an absolute upper bound (default 30 days,
`AUTH_SESSION_ABSOLUTE_TTL_SECONDS`) set at login and never extended by
rotation — every refresh's new token expiry is capped to
`min(now + AUTH_REFRESH_TTL_SECONDS, session.expiresAt)`. `logout` revokes
the identified session and its unused refresh tokens (idempotent — never
reveals whether the presented cookie was valid). `logout-all` revokes
every active session for the authenticated user only (verified: a second
user's session is untouched). Role/account-status changes take effect on
the very next request because the principal is re-resolved from
PostgreSQL every time, not cached in the JWT.

## RBAC Boundary
`JwtAuthenticationGuard` is registered globally (`APP_GUARD`) — every route
requires a valid access token unless `@Public()`. `RolesGuard` +
`@Roles(...codes)` authorize strictly against the principal
`JwtAuthenticationGuard` already resolved from the database — never from
JWT claims or client-supplied data. Returns 401 when unauthenticated
(no/invalid token) and 403 when authenticated but lacking a required role.
RBAC is exercised through a **test-only** `RbacTestController`
(`apps/api/test/support/rbac-test.controller.ts`) — deliberately placed
under `test/`, not `src/`, so it is never compiled into the production
`dist/` build or exposed by the running container; only `auth.e2e-spec.ts`
registers it on its `TestingModule`.

## API Endpoints
| Endpoint | Auth | Behavior |
|---|---|---|
| `POST /auth/login` | Public, throttled | Generic error; verifies Argon2id; loads all assigned roles; creates session + initial refresh token; returns access token + safe principal; sets refresh cookie |
| `POST /auth/refresh` | Public, throttled | Reads refresh cookie; atomic rotation; reuse detection; returns new access token; replaces cookie |
| `POST /auth/logout` | Public (identified via cookie) | Revokes session + tokens if identifiable; idempotent; clears cookie |
| `POST /auth/logout-all` | Requires access token | Revokes every session for the authenticated user |
| `GET /auth/me` | Requires access token | Returns `{ userId, displayName, roleCodes }` only |

`GET /health`, `/health/live`, `/health/ready` remain `@Public()`. Every
auth response carries `Cache-Control: no-store` and `Pragma: no-cache`.
`OriginGuard` (controller-scoped) rejects any request to `/auth/*` whose
`Origin` header is present but not on the exact allow-list — verified: a
disallowed `Origin` gets HTTP 403 on `/auth/login`.

## Admin Web Authentication
`apps/admin-web/src/app/auth-context.tsx` (`AuthProvider`) holds the
access token in a `useRef` (memory only), attempts exactly one silent
`/auth/refresh` on mount (`cancelled` guard prevents any race/loop), then
`GET /auth/me` on success. `/login` (generic error, disabled-while-submitting
button, accessible labeled fields) and `/` (redirects unauthenticated
visitors to `/login`, shows safe `displayName`/`roleCodes` + sign-out when
authenticated) are both client components. No `localStorage`/
`sessionStorage`/IndexedDB read or write anywhere in the auth path —
verified by both a static source scan (`verify.sh`) and unit tests
asserting `localStorage.length === 0`/`sessionStorage.length === 0` after
a full authenticated bootstrap.

## Mobile/PWA Authentication
Same architecture as Admin Web, adapted for mobile viewport, plus an
explicit `offline` status distinguishing a network failure from "no
session" (shows a retry-safe message instead of redirecting to login).
This repository has **no service worker** at all (no `next-pwa`/workbox
integration), so there is nothing that could cache an auth response;
`mobile-verify.sh` asserts this explicitly (no `sw.js`, no
`serviceWorker.register` call) rather than assuming it.

## Bootstrap Boundary
`apps/api/src/bootstrap/create-super-admin.cli.ts`, run only via
`npm run auth:bootstrap-super-admin --workspace=apps/api -- --login-id=... --display-name=...`.
Refuses if any `SUPER_ADMIN` assignment already exists; refuses a
duplicate `loginId`; prompts for the password with hidden input (TTY) or
`AUTH_BOOTSTRAP_PASSWORD` (non-TTY, operator-supplied, never a committed
default); enforces the same password policy; creates the `User` +
`UserRoleAssignment` in one transaction; prints only the User ID, loginId,
and role — never the password or hash. Guarded by `require.main === module`
so importing it (to unit-test argument parsing) never executes it. Never
referenced by `build`, `start`, Docker `CMD`, or `prisma db seed`.
**Confirmed not created/run during this task** — every automated
verification pass ended with 0 Users in the database.

## Files Created
```
apps/api/prisma/migrations/20260722105124_authentication_session_foundation/migration.sql
apps/api/src/auth/auth.controller.ts
apps/api/src/auth/auth.module.ts
apps/api/src/auth/auth.service.ts
apps/api/src/auth/auth.service.spec.ts
apps/api/src/auth/login-id.ts
apps/api/src/auth/login-id.spec.ts
apps/api/src/auth/config/auth.config.ts
apps/api/src/auth/config/auth.config.spec.ts
apps/api/src/auth/dto/login.dto.ts
apps/api/src/auth/password/password-hasher.ts
apps/api/src/auth/password/password-policy.ts
apps/api/src/auth/password/password-policy.spec.ts
apps/api/src/auth/password/argon2-password-hasher.ts
apps/api/src/auth/password/argon2-password-hasher.spec.ts
apps/api/src/auth/tokens/access-token.service.ts
apps/api/src/auth/tokens/access-token.service.spec.ts
apps/api/src/auth/tokens/refresh-token.service.ts
apps/api/src/auth/tokens/refresh-token.service.spec.ts
apps/api/src/auth/guards/jwt-authentication.guard.ts
apps/api/src/auth/guards/jwt-authentication.guard.spec.ts
apps/api/src/auth/guards/roles.guard.ts
apps/api/src/auth/guards/roles.guard.spec.ts
apps/api/src/auth/guards/origin.guard.ts
apps/api/src/auth/guards/origin.guard.spec.ts
apps/api/src/auth/decorators/public.decorator.ts
apps/api/src/auth/decorators/roles.decorator.ts
apps/api/src/auth/decorators/current-principal.decorator.ts
apps/api/src/auth/types/authenticated-principal.ts
apps/api/src/bootstrap/create-super-admin.cli.ts
apps/api/src/bootstrap/create-super-admin.cli.spec.ts
apps/api/src/infrastructure/database/repositories/prisma-session.repository.ts
apps/api/src/infrastructure/database/repositories/prisma-user-role-assignment.repository.ts
apps/api/src/test-setup.ts
apps/api/test/env-setup.ts
apps/api/test/auth.integration-spec.ts
apps/api/test/auth.e2e-spec.ts
apps/api/test/support/rbac-test.controller.ts
apps/admin-web/src/app/auth-context.tsx
apps/admin-web/src/app/login/page.tsx
apps/admin-web/src/app/login/__tests__/page.test.tsx
apps/admin-web/src/lib/auth-client.ts
apps/mobile-pwa/src/app/auth-context.tsx
apps/mobile-pwa/src/app/login/page.tsx
apps/mobile-pwa/src/app/login/__tests__/page.test.tsx
apps/mobile-pwa/src/lib/auth-client.ts
docs/CTO_SUMMARY_AUTH_001.md
```

## Files Modified
```
apps/api/prisma/schema.prisma
apps/api/package.json
apps/api/tsconfig.json
apps/api/src/app.module.ts
apps/api/src/main.ts
apps/api/src/health/health.controller.ts
apps/api/src/infrastructure/database/repositories/prisma-user.repository.ts
apps/api/src/infrastructure/database/repositories/repositories.module.ts
apps/api/test/jest-e2e.json
apps/api/test/jest-integration.json
apps/admin-web/src/app/layout.tsx
apps/admin-web/src/app/page.tsx
apps/admin-web/src/app/__tests__/page.test.tsx
apps/mobile-pwa/src/app/layout.tsx
apps/mobile-pwa/src/app/page.tsx
apps/mobile-pwa/src/app/__tests__/page.test.tsx
packages/domain/src/index.ts
packages/domain/src/index.test.ts
packages/contracts/src/index.ts
docker-compose.yml
.env.example
.dockerignore
.github/workflows/ci.yml
scripts/verify.sh
scripts/db-verify.sh
scripts/api-smoke-test.sh
scripts/mobile-verify.sh
scripts/security-review.sh
CLAUDE.md
README.md
docs/SECURITY_REVIEW_LOG.md
docs/SECURITY_REVIEW_CHECKLIST.md
docs/SECURITY_HARNESS.md
Dispatch Knowledge/11 - Technical Architecture และแผนพัฒนา MVP.md
package-lock.json
```

## Dependency Changes
Added to `apps/api`: `@nestjs/jwt@11.0.2`, `@nestjs/throttler@6.5.0`,
`cookie-parser@1.4.7` (+ `@types/cookie-parser@1.4.10` dev),
`@node-rs/argon2@2.0.2`. `npm audit` (whole workspace): **0
vulnerabilities** before and after.

## Verification Result
```
./scripts/verify.sh          → PASS (workspace deps, Prisma generate/validate, lint, typecheck, unit tests all workspaces [93 apps/api + 6 admin-web + 8 mobile-pwa + 23 packages/*], build all workspaces incl. next build for both frontends, compose config, token-storage scan)
./scripts/docker-verify.sh   → PASS (db/api healthy, admin-web/mobile-pwa reachable)
./scripts/db-verify.sh       → PASS (migrate deploy clean, seed idempotent, exactly 6 roles, 0 default users, auth tables present, 24 integration + 15 e2e tests passed, 0 residual sessions/tokens/users after)
./scripts/api-smoke-test.sh  → PASS (health endpoints + /auth/me 401 + /auth/login generic 401, no internal-detail leak)
./scripts/mobile-verify.sh   → PASS (reachable, /login marker, no token-storage writes, no service worker)
./scripts/security-review.sh → PASS (0 HIGH/CRITICAL; secret-scan 1 WARN — DATABASE_URL string mentions in comments/tests, reviewed as false positive; Docker safety PASS)
./scripts/e2e-local.sh       → PASS (4/4 Playwright: Admin Web identifies itself, Mobile/PWA identifies itself, health, liveness)
```

## Authentication Verification Result
`auth.service.spec.ts` (unit, mocked repos) and `auth.e2e-spec.ts`/
`auth.integration-spec.ts` (real PostgreSQL, via the Docker network)
together cover: login success/invalid-loginId/invalid-password/
inactive-user/credentials-disabled, session+token creation, refresh
rotation, reuse detection (used, revoked, concurrent-race), expired
token/session, revoked session, logout, logout-all, multiple/zero role
resolution, 401 unauthenticated, 403 insufficient-role, no plaintext token
anywhere in the database. All passed on every run.

## Database Verification Result
- Migrations applied (in order): `20260722070103_identity_role_foundation`,
  `20260722105124_authentication_session_foundation`.
- Roles: exactly 6, codes match `DISPATCH_ROLE_CODES` exactly.
- Users: **0** before, during (only test-scoped rows, all deleted by each
  suite's `afterAll`), and after the full verification pass.
- `auth_sessions` / `refresh_token_records`: **0/0** after the full test
  run — no residue.

## Docker Verification Result
`db`, `api`, `admin-web`, `mobile-pwa` all rebuilt and running; `db`/`api`
report `healthy`; `admin-web`/`mobile-pwa` reachable by HTTP. `db` remains
internal-only (no host port). Stack left running throughout and afterward
— no teardown command was ever run.

## GitHub/CI Foundation
- `build-and-test` and `compose-config` jobs: added a deterministic
  test-only `JWT_ACCESS_SECRET` (required by `docker compose config`'s new
  `${JWT_ACCESS_SECRET:?...}` guard and by `loadAuthConfig()` at Nest
  bootstrap/module-load time).
- `db-integration` job: added `JWT_ACCESS_SECRET` and generous
  `AUTH_LOGIN_RATE_LIMIT`/`AUTH_REFRESH_RATE_LIMIT` (test suites call
  `/auth/login`/`/auth/refresh` far more often than a real client would in
  the production window); the integration-test step now implicitly covers
  `auth.integration-spec.ts`/`auth.e2e-spec.ts`; added an explicit
  "confirm no default User exists" step after the test run.
- YAML validated locally with `python3 -c "import yaml; yaml.safe_load(...)"`
  — parses cleanly, jobs list unchanged in count/order plus the one new
  step. No unquoted `: ` ambiguity introduced.
- No deployment, no Git mutation, no tag creation added anywhere in CI.
- Remote GitHub Actions status: **NOT YET RUN** — local verification is complete, but only the user's push can trigger and confirm the updated workflow.

## Issues Found
1. **`nest build` silently nested `dist/main.js` under `dist/src/` (found
   and fixed)** — `apps/api/src/test-setup.ts` originally did
   `import "../test/env-setup"`, reaching a file **outside** `src/`. This
   pulled `test/env-setup.ts` into `nest build`'s TypeScript program,
   shifting the compiler's inferred common-root directory from `src/` to
   `apps/api/`, which renested every emitted file
   (`dist/src/main.js` instead of `dist/main.js`) and broke the Docker
   image's `CMD ["node", "dist/main.js"]` — the `api` container
   crash-looped with `Cannot find module '/repo/apps/api/dist/main.js'`.
   Root-caused by reproducing the exact `nest build`/`tsc` invocation in a
   clean Alpine container. Fixed two ways: (a) `src/test-setup.ts` now
   duplicates its few lines of env-var defaults instead of importing
   across the `src/`/`test/` boundary; (b) added an explicit
   `"rootDir": "./src"` to `apps/api/tsconfig.json` so any future
   cross-boundary import fails loudly at compile time (`TS6059`) instead
   of silently corrupting the output layout.
2. **Stale `tsconfig.tsbuildinfo` outside `dist/` leaking into the Docker
   build context (found and fixed)** — while diagnosing #1, found that
   `apps/api/tsconfig.tsbuildinfo` (TypeScript's incremental-build cache,
   written next to the tsconfig rather than inside `dist/`) was covered by
   `.gitignore` but **not** `.dockerignore`, so a locally-generated stale
   copy was copied into every Docker build context via
   `COPY apps/api ./apps/api`, corrupting `tsc`'s incremental decisions
   inside the container even after the source was fixed. Fixed by adding
   `**/*.tsbuildinfo` to `.dockerignore` and deleting the stale local
   files. Verified with a `--no-cache` Docker build afterward.
3. **Accidental secret exposure in this session's tool output (found and
   fully remediated)** — a Compose inspection command printed the real
   local-development `JWT_ACCESS_SECRET` and the pre-existing
   `POSTGRES_PASSWORD` embedded in the rendered `DATABASE_URL`. Neither value
   entered Git, but both were treated as exposed. `JWT_ACCESS_SECRET` was
   regenerated. The PostgreSQL role password was rotated interactively,
   verified through TCP authentication, and synchronized to the ignored
   local `.env` with permission mode `600`. `dispatch-db` and `dispatch-api`
   were recreated non-destructively while preserving the database volume;
   both became `healthy`, `/health/ready` returned database status `ok`, and
   Prisma reported both migrations applied. The temporary secret file was
   deleted, its environment variable unset, and the clipboard cleared.
   Details are recorded in `docs/SECURITY_REVIEW_LOG.md`.

4. **`@node-rs/argon2`'s `Algorithm` const enum incompatible with
   `isolatedModules` (found and fixed)** — TypeScript error `TS2748`
   importing the library's `export declare const enum Algorithm`. Fixed
   by passing the numeric literal (`2` = `Argon2id`, documented with a
   comment) instead of importing the enum value.
5. **`@Header()` cannot be applied at controller class level (found and
   fixed)** — TypeScript decorator-signature errors; moved the two
   `Cache-Control`/`Pragma` header decorators from the `AuthController`
   class onto each individual route method.

All five issues were found and resolved during this task's own
verification pass, before declaring PASS.

## Risk (Low / Medium / High)
Low. Additive migration only, applied to a database confirmed to have 0
Users beforehand. No default account. No plaintext credential anywhere.
Reuse/concurrency behavior verified directly, not just asserted. The two
build-pipeline issues (#1, #2 above) were caught by this task's own Docker
verification pass, not left for the user to discover.

## Security Review
| Field | Description |
|---|---|
| Authentication impact | Full login/refresh/logout/logout-all/me implemented; generic errors never reveal loginId existence (verified: unknown-loginId and wrong-password responses are byte-identical) |
| Password/hash impact | Argon2id (`@node-rs/argon2`), library-generated salt, no plaintext ever stored/logged/returned; 12–128 char policy, no forced composition |
| Access-token impact | HS256, `sub`/`sid`/`jti` only, 15 min default TTL, issuer/audience/signature/expiry all verified; never treated as the authorization source of truth |
| Refresh-token impact | Opaque, 256-bit entropy, SHA-256 hash only ever persisted, HttpOnly-cookie-only delivery, atomic single-use rotation verified under concurrency |
| Session-revocation impact | Server-side `AuthSession`/`RefreshTokenRecord`; immediate revocation on logout/logout-all/reuse-detection; absolute session-expiry cap enforced on every rotation |
| RBAC impact | `RolesGuard` authorizes only against the database-resolved principal; 401 vs 403 distinction verified; unknown role codes filtered out defensively |
| User-to-Role cardinality impact | Unchanged neutral boundary — reads however many roles are assigned, enforces neither single- nor multi-role policy |
| Data privacy impact | `GET /auth/me` returns only `userId`/`displayName`/`roleCodes` — no loginId, no passwordHash, no session internals |
| Cookie/CORS/CSRF impact | `HttpOnly`, `SameSite=Lax`, `Path=/auth`, `Secure` configurable (must be `true` in production); exact-origin CORS (no wildcard+credentials); `OriginGuard` adds defense-in-depth rejection of disallowed Origins on auth routes specifically |
| Client token-storage impact | No localStorage/sessionStorage/IndexedDB token storage on either client — enforced by a static source scan plus unit tests |
| Mobile/PWA security impact | Same guarantees as Admin Web; no service worker exists to cache auth responses; all auth fetches use `cache: "no-store"` |
| Bootstrap-account impact | No default SUPER_ADMIN or password ever created/committed; explicit operator CLI only, guarded against double-invocation and non-TTY silent password sourcing |
| Migration safety impact | Purely additive SQL (verified by inspection before deploy); applied only via `prisma migrate deploy` against a database confirmed to have 0 Users beforehand |
| Database credential impact | One local session-output exposure affected `JWT_ACCESS_SECRET` and `POSTGRES_PASSWORD`/rendered `DATABASE_URL`; both credentials were rotated, DB/API were recreated non-destructively, and database authentication/readiness were reverified. No value entered Git. |
| Secrets/logging check | See Issues Found #3 — the local session-output exposure was disclosed and fully remediated by rotating both affected credentials; the temporary secret file and clipboard were cleared, and no secret is Git-tracked. |
| Rate-limiting impact | Login/refresh throttled (`@nestjs/throttler`, in-memory — documented as sufficient for this single-instance foundation, a distributed store is future infrastructure); rate-limit key is IP-based, no sensitive value |
| Dependency/advisory impact | `npm audit`: 0 HIGH/CRITICAL after adding `@nestjs/jwt`, `@nestjs/throttler`, `cookie-parser`, `@node-rs/argon2` |
| Docker safety impact | No destructive command added anywhere; all harness self-guards intact; production image still runs compiled `dist/main.js` (path bug from Issues Found #1 fixed and reverified) |
| New endpoint exposure | `/auth/login`, `/auth/refresh`, `/auth/logout` public by design (identity not yet established); `/auth/logout-all`, `/auth/me` require a valid access token; health endpoints remain public |
| Risk level | Low |
| Security decision (PASS/FAIL) | PASS |

## Decision (PASS / FAIL)
PASS — every required verification command exited 0 against the real
Docker stack and real PostgreSQL database, reuse/concurrency/revocation
behavior was verified directly (not just asserted), no default account
exists, no plaintext credential exists anywhere, and no destructive
Git/Docker/database operation occurred.

## Remaining Work
- Business modules (Customer Master, Delivery Task, Preparation,
  Assignment, delivery/GPS/evidence, Returns, Emergency Override,
  reporting) — MVP-02 onward.
- User-management / Role-management UI, self-registration, password
  reset, MFA, SSO — all explicitly out of scope for AUTH-001.
- Production secret management, `Secure`/`Domain` cookie configuration for
  a real HTTPS domain, and distributed (Redis-backed) rate limiting remain
  unresolved — explicitly deferred, not silently assumed.
- Business route-permission matrix (Topic 11 §10, guard layers 2–6) begins
  with the business Commands that need it.

## Remaining Business Decisions
None newly identified. User-to-Role cardinality remains intentionally
undecided by design (a technical neutrality, not an open BDR) — a future
Business Owner decision, not something this task should default.

## Next Step
Commit, push, and confirm remote GitHub Actions passes for this branch.
After remote CI is green, proceed to **MVP-02** — Customer and Task
Creation per Dispatch Knowledge Topic 11 §21 Implementation Roadmap.

## Recommended Commit Message
```
feat(dispatch): add authentication and rbac foundation

Add JWT access-token + rotating opaque refresh-token authentication with
server-side session/revocation storage (AuthSession, RefreshTokenRecord),
Argon2id password hashing, neutral loginId, JwtAuthenticationGuard +
RolesGuard RBAC, login/refresh/logout/logout-all/me endpoints, an
operator-only SUPER_ADMIN bootstrap CLI, and minimal login/session shells
for Admin Web and Mobile/PWA. No default account. No Dispatch business
workflow implemented.
```
