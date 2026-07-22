# CTO Summary

## Task
DEV-FOUNDATION-002 — Database and API Foundation

## Status (PASS / FAIL)
PASS

## Scope
Establish the Dispatch database and API foundation on top of the completed
DEV-FOUNDATION-001 repository/tooling foundation: PostgreSQL/Prisma
persistence, database-aware liveness/readiness endpoints, an initial
technical Identity/Role schema (no login/business behavior), migration and
seed tooling, database verification, and CI database integration. No
Authentication (AUTH-001) or Dispatch delivery business workflow is
implemented.

## Pre-flight Findings
- Git: clean working tree at `2b349dc` (tag
  `v0.11.0-dispatch-repository-tooling-foundation`), branch `main` tracking
  `origin/main`.
- Docker: the DEV-FOUNDATION-001 stack (`db`, `api`, `admin-web`,
  `mobile-pwa`) was already running and healthy.
- Database state before any change: `dispatch` database existed with
  **zero tables**, no `_prisma_migrations` table, no unexpected schemas —
  confirmed via read-only `\dt` / `\dn` / `\l` before writing any schema.
  Safe to introduce the first migration.
- Existing API structure: `GET /health` only (`{"status":"ok","service":"dispatch-api"}`,
  exactly 2 fields), no Prisma, no database connection, no auth.
- CI: single `build-and-test` job (lint/typecheck/test/build, all
  workspaces) + `compose-config` + `security-ci` — no database service.
- Package versions of note (pre-existing): `@nestjs/*` `^11.1.28`,
  TypeScript `5.9.3` (root override), Node.js 22, Jest `^29.7.0` for
  `apps/api`, Vitest `^4.1.10` for `packages/*`.

### Approved role list (Dispatch Knowledge Topic 03 §4, Topic 11 §7.2)
Exactly six: `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `STOCK`,
`INTERNAL_DELIVERY_EMPLOYEE`, `MANAGEMENT_AUDITOR`. External Courier
(§4.7) and Customer (§4.8) explicitly have no application login account in
Phase 1.

### User-to-Role cardinality — not decided by source documents
Topic 03 §3.2/§13.3 establish **Task ownership** cardinality ("one Task,
one primary responsible person, one User Login") — a statement about task
assignment, not about how many roles a single user account may hold.
Neither Topic 03 nor Topic 11 §7.2 states whether a user may hold more
than one role simultaneously. Per the task's decision guard, this is
**not resolved here**: the schema (`UserRoleAssignment`, a join table with
a `(userId, roleId)` uniqueness constraint only) is cardinality-neutral —
it can represent one or many role assignments per user without activating
any single-role or multi-role authorization rule. No new BDR was created;
no role-assignment-creation endpoint exists. This remains an AUTH-001
authorization-policy boundary, recorded in `Dispatch Knowledge/11...md`
§0 (Synchronization pass 2) and §21.

### Login identifier — not invented
No source document (Topic 03, Topic 11 §7.1/§7.2) requires or specifies an
email/username/employee-number login identifier for Phase 1. None is
introduced. `User` carries only a minimal neutral `displayName` field plus
`isActive`/timestamps — no credential of any kind. AUTH-001 may add a login
identifier later via a controlled migration.

**No conflict between source documents and this task's scope was found** —
proceeded without flagging a Business Decision.

## Architecture Implemented
- **Prisma foundation** in `apps/api`: `prisma`/`@prisma/client` pinned to
  exact version `6.19.3` (verified in `package-lock.json`).
- **PrismaModule/PrismaService** (`apps/api/src/infrastructure/database/prisma/`):
  `@Global()` module; service extends `PrismaClient`, connects/disconnects
  via `OnModuleInit`/`OnModuleDestroy`, logs only `error`/`warn` levels
  (never `query`, never DATABASE_URL/credentials).
- **Identity/Role repository boundary**: framework/ORM-independent
  `UserRecord`, `RoleRecord`, `UserRoleAssignmentRecord`, `UserRepository`,
  `RoleRepository` in `packages/domain` (zero external dependencies, no
  Prisma/NestJS import); `PrismaUserRepository`/`PrismaRoleRepository`
  adapters in `apps/api/src/infrastructure/database/repositories/`
  implementing those interfaces without exposing Prisma types to callers.
  No controller, no CRUD API, no application use case beyond verification.
- **Role-code drift protection**: `DISPATCH_ROLE_CODES` (`as const` tuple +
  derived union type) added to `packages/shared-types` — the single
  runtime source of truth. `prisma/seed.ts` imports this constant directly
  (rather than maintaining a second hardcoded list), and
  `apps/api/test/identity-role.integration-spec.ts` asserts the seeded DB
  role codes equal this constant exactly — so the seed and the shared
  constant cannot silently drift apart.
- **Health/readiness split**: `GET /health/live` (liveness, no DB), `GET
  /health/ready` (readiness, `SELECT 1`, 503 generic-body on failure),
  `GET /health` (backward-compatible alias of readiness). Docker
  healthcheck now targets `/health/ready`.
- **Global API foundation**: `ValidationPipe({ whitelist: true, transform:
  true, forbidNonWhitelisted: true })` and `app.enableShutdownHooks()`
  added in `main.ts` (needed so `PrismaService.onModuleDestroy` runs on
  graceful shutdown).

## Database Schema
`apps/api/prisma/schema.prisma` — PostgreSQL provider, `DATABASE_URL` from
environment. snake_case table/column mapping via `@map`/`@@map`,
`timestamptz(6)` for all timestamps.

| Model | Table | Key fields |
|---|---|---|
| `User` | `users` | `id` (uuid pk), `display_name`, `is_active` (default true), `created_at`, `updated_at`. No password/hash/token/session field. |
| `Role` | `roles` | `id` (uuid pk), `code` (unique), `display_name`, `is_system_role` (default true), `created_at`, `updated_at`. |
| `UserRoleAssignment` | `user_role_assignments` | `id` (uuid pk), `user_id` → `users.id` (`onDelete: Restrict`), `role_id` → `roles.id` (`onDelete: Restrict`), `assigned_at`. Unique `(user_id, role_id)`; indexed on both FKs. |

`onDelete: Restrict` on both relations means a `User` or `Role` with any
assignment history cannot be deleted out from under it — no cascade can
silently destroy assignment history. No Audit Log table, no session table
— out of scope for this milestone.

## Migration
`apps/api/prisma/migrations/20260722070103_identity_role_foundation/migration.sql`,
generated offline via `prisma migrate diff --from-empty
--to-schema-datamodel prisma/schema.prisma --script` (no database
connection needed to generate it — avoids any shadow-database dependency).
Creates the three tables above plus the unique/index constraints and both
foreign keys. `apps/api/prisma/migrations/migration_lock.toml` pins
`provider = "postgresql"`. Applied via `prisma migrate deploy` only —
`prisma migrate dev` and `prisma migrate reset` are never used against
this database (see `scripts/db-verify.sh` and its self-guard).

## Seed
`apps/api/prisma/seed.ts` — idempotent `upsert` per role code from
`DISPATCH_ROLE_CODES`. Fails safely (throws, non-zero exit) if it finds an
existing role row with a matching code that is *not* marked
`isSystemRole`, rather than silently overwriting it. Never creates a
`User`, never touches a credential, never deletes unknown data. Runs via
`prisma db seed` (configured through `package.json#prisma.seed` →
`ts-node prisma/seed.ts`).

## Identity/Role Boundary
Technical persistence foundation only, as scoped: no controller, no CRUD
endpoint, no permission enforcement, no default `User`. See "User-to-Role
cardinality" and "Login identifier" notes above for the two open technical
questions this milestone deliberately left neutral rather than deciding.

## API Health and Readiness
- `GET /health/live` → `200 {"status":"ok","service":"dispatch-api"}` (no DB dependency)
- `GET /health/ready` → `200 {"status":"ok","service":"dispatch-api","database":"ok"}` when the database is reachable; `503` with a generic body (`"Service unavailable"`, no host/credential/SQL detail) when it is not
- `GET /health` → mirrors `/health/ready` (backward compatible with DEV-FOUNDATION-001 links/healthchecks)

The 503 path and the "liveness never touches Prisma" guarantee are both
covered by mocked unit tests (`src/health/health.service.spec.ts`,
`src/health/health.controller.spec.ts`) — deterministic, no real database
required, part of the default `npm test`. The success path against a real
database is covered separately by
`apps/api/test/health-readiness.integration-spec.ts`.

## Files Created
```
apps/api/prisma/schema.prisma
apps/api/prisma/seed.ts
apps/api/prisma/migrations/migration_lock.toml
apps/api/prisma/migrations/20260722070103_identity_role_foundation/migration.sql
apps/api/src/infrastructure/database/prisma/prisma.module.ts
apps/api/src/infrastructure/database/prisma/prisma.service.ts
apps/api/src/infrastructure/database/prisma/prisma.service.spec.ts
apps/api/src/infrastructure/database/repositories/prisma-user.repository.ts
apps/api/src/infrastructure/database/repositories/prisma-role.repository.ts
apps/api/src/infrastructure/database/repositories/repositories.module.ts
apps/api/src/health/health.service.spec.ts
apps/api/test/jest-integration.json
apps/api/test/identity-role.integration-spec.ts
apps/api/test/health-readiness.integration-spec.ts
scripts/db-verify.sh
docs/CTO_SUMMARY_DEV_FOUNDATION_002.md
```

## Files Modified
```
package.json, package-lock.json
apps/api/package.json
apps/api/Dockerfile
apps/api/src/app.module.ts
apps/api/src/main.ts
apps/api/src/health/health.controller.ts
apps/api/src/health/health.service.ts
apps/api/src/health/health.module.ts
apps/api/src/health/health.controller.spec.ts
apps/api/test/health.e2e-spec.ts
packages/shared-types/src/index.ts (+ index.test.ts)
packages/domain/src/index.ts (+ index.test.ts)
packages/contracts/src/index.ts (+ index.test.ts)
docker-compose.yml
.env.example
scripts/verify.sh
scripts/docker-verify.sh
scripts/api-smoke-test.sh
.github/workflows/ci.yml
e2e/tests/foundation.spec.ts
CLAUDE.md
README.md
docs/SECURITY_REVIEW_LOG.md
Dispatch Knowledge/11 - Technical Architecture และแผนพัฒนา MVP.md
```

## Dependency Changes
- Added `prisma` `6.19.3` and `@prisma/client` `6.19.3` to `apps/api`
  (exact versions, confirmed pinned in `package-lock.json`).
- Added `class-validator` `^0.15.1` and `class-transformer` `^0.5.1` to
  `apps/api` — required by the global `ValidationPipe({ transform: true })`
  added in `main.ts`; missing this caused the api container to crash-loop
  on boot during verification (see Issues Found).
- Added `@dispatch/domain` as an `apps/api` workspace dependency (already
  existed as a workspace package; not previously consumed by `apps/api`).
- `npm audit` after install: **0 vulnerabilities**.

## Verification Result
```
./scripts/verify.sh          → PASS (workspace deps, Prisma generate/validate, lint, typecheck, unit tests all workspaces, build all workspaces, compose config) — run twice, clean both times
./scripts/docker-verify.sh   → PASS (db healthy, api healthy, GET /health + /health/live expected bodies, admin-web/mobile-pwa reachable)
./scripts/db-verify.sh       → PASS (migrate deploy applied, seed idempotent, exactly 6 roles, 0 default users, 15 DB integration/e2e tests passed)
./scripts/api-smoke-test.sh  → PASS (GET /health, /health/live, /health/ready all correct — field counts and values)
./scripts/mobile-verify.sh   → PASS (reachable, foundation marker, manifest.webmanifest valid)
./scripts/security-review.sh → PASS (0 HIGH/CRITICAL; secret-scan WARN on DATABASE_URL string occurrences reviewed — no real secret, see docs/SECURITY_REVIEW_LOG.md; Docker safety checks PASS)
./scripts/e2e-local.sh       → PASS (4/4 Playwright tests: readiness body, liveness body, Admin Web, Mobile/PWA)
```

## Database Verification Result
`scripts/db-verify.sh` ran end-to-end against the real `dispatch-db`
container (pre-flight confirmed empty, no `_prisma_migrations`, no
unexpected tables):

- `prisma migrate status` (informational — reported the migration as
  pending, as expected on an empty database) → `prisma migrate deploy`
  applied `20260722070103_identity_role_foundation` → **"All migrations
  have been successfully applied."**
- `prisma db seed` → idempotent upsert reported **6 role(s) present**:
  `ADMIN`, `DISPATCHER`, `INTERNAL_DELIVERY_EMPLOYEE`,
  `MANAGEMENT_AUDITOR`, `STOCK`, `SUPER_ADMIN`.
- Read-only inspection: database connectivity confirmed (`SELECT 1`);
  applied migration name confirmed via `_prisma_migrations`; role count =
  6, codes match `DISPATCH_ROLE_CODES` exactly; **user count = 0** (no
  default User).
- Database integration test suite (throwaway `builder`-stage container,
  never the production runtime image): `test:integration` — 2 suites, 12
  tests passed (Prisma connectivity, exactly-6-roles, no-default-user,
  seed re-run idempotency, unique role-code constraint, repository
  read-back, unknown-id → null, readiness success, liveness without DB).
  `test:e2e` — 1 suite, 3 tests passed (`/health/live`, `/health/ready`,
  `/health` against the real running AppModule + PrismaModule).
- No drop/reset/truncate occurred; `db` and `api` containers left running
  throughout and afterward.

## Docker Verification Result
`scripts/docker-verify.sh` PASS: `docker compose config` valid;
`docker compose up -d --build` succeeded for all four services;
`dispatch-db` and `dispatch-api` both reported `healthy`
(`dispatch-api`'s healthcheck now targets `/health/ready`); `GET /health`
returned `{"status":"ok","service":"dispatch-api","database":"ok"}`; `GET
/health/live` returned `{"status":"ok","service":"dispatch-api"}`;
`admin-web` (6001) and `mobile-pwa` (6003) both reachable by HTTP.
All four containers were left running. Docker healthchecks reported `healthy`
for `dispatch-db` and `dispatch-api`; `admin-web` and `mobile-pwa` do not define
container healthchecks and were verified through HTTP reachability.

## GitHub/CI Foundation
- Existing `build-and-test` job: added Prisma generate/validate steps
  (placeholder `DATABASE_URL`, schema-only, no real connection) before
  lint/typecheck/test/build — required because `apps/api`'s
  infrastructure/database layer imports `@prisma/client` types.
- Existing `compose-config` and `security-ci` jobs: unchanged.
- New `db-integration` job: PostgreSQL 16 service container with
  test-only credentials (`dispatch_ci_user` / `dispatch_ci_password_test_only`
  — never a production secret), runs Prisma generate/validate, `migrate
  deploy`, the idempotent seed, and the database integration test suite
  (`test:integration` + `test:e2e` for `apps/api`). No deployment, no Git
  mutation, no tag creation.
- Remote GitHub Actions status: **NOT YET RUN** — only the user's push
  triggers real CI; this cannot be claimed as passed by Claude/Codex.

## Issues Found
1. **Docker Desktop daemon connectivity drop (environment, not code)** —
   `docker ps`/`docker compose` failed with a connection EOF for several
   minutes during the rebuild step. Not caused by any command run here
   (the failure preceded the first `docker compose up -d --build`
   attempt); resolved after Docker Desktop's backend recovered on its own.
   No destructive action was taken in response — verification simply
   waited (with the user's explicit confirmation to keep waiting) for the
   daemon to become responsive again.
2. **Missing `class-validator`/`class-transformer` (found and fixed)** —
   the global `ValidationPipe({ transform: true, ... })` added to
   `main.ts` requires `class-validator`/`class-transformer` at runtime;
   without them the api container logged `The "class-validator" package
   is missing` and crash-looped (`Restarting (1)`) instead of starting,
   which `docker-verify.sh` would have caught as an unhealthy container.
   Fixed by adding both as exact-enough (`^`) dependencies to
   `apps/api/package.json`, reinstalling, and rebuilding — confirmed
   healthy afterward.
3. **`db-verify.sh` self-guard false positive (found and fixed)** — the
   script's own destructive-command safety-guard regex included the
   literal alternative `|migrate:reset`, which incidentally appeared
   verbatim inside the guard's own pattern-definition line, so the guard
   tripped on itself before ever reaching a real check. Fixed by dropping
   that redundant alternative (the meaningful check,
   `prisma[[:space:]]+migrate[[:space:]]+reset`, requires actual
   whitespace and does not self-match) and excluding the
   `FORBIDDEN_PATTERN=` line from the scan, matching the same self-guard
   pattern already used successfully in `docker-verify.sh`/`e2e-local.sh`.
4. **`prisma migrate status` non-zero exit on a fresh database (found and
   fixed)** — `prisma migrate status` exits non-zero when a migration is
   pending, which is the expected state on a database before its first
   `migrate deploy`. Under `set -e` this aborted `db-verify.sh` at an
   informational step. Fixed by appending `|| true` to that one command
   (the real pass/fail gate is the subsequent `migrate deploy` call,
   which is not similarly relaxed).

All four issues were found and resolved during this task's own
verification pass, before declaring PASS.

## Risk (Low / Medium / High)
Low. No credentials, no login, no business endpoint, no default account.
Additive schema only; migration applied to a database confirmed empty
before any change.

## Security Review
| Field | Description |
|---|---|
| Auth impact | None — no login/JWT/session code exists. AUTH-001 remains a future milestone. |
| RBAC impact | None — no permission enforcement exists yet; repository boundary has no authorization logic. |
| Data privacy impact | Identity/Role schema stores only a neutral `displayName` and role codes — no PII beyond a display name, no customer data. |
| Password/token/hash impact | None — no such field exists in the schema or anywhere in code. |
| Database credential impact | `POSTGRES_PASSWORD` required (no default), never logged; `PrismaService` logs only `error`/`warn` levels, never queries or connection strings. |
| Migration safety impact | Applied only via `prisma migrate deploy` against a database confirmed empty beforehand; `prisma migrate dev`/`migrate reset` never used; `db-verify.sh` self-guards against destructive commands. |
| Mobile security impact | None — `apps/mobile-pwa` unaffected by this change. |
| Dependency/advisory impact | `npm audit` — 0 vulnerabilities after adding `prisma`/`@prisma/client` 6.19.3. |
| Secrets/logging check | No DATABASE_URL/credential ever logged or printed by any script; secret-scan WARN reviewed as false-positive (variable name only, see SECURITY_REVIEW_LOG.md). |
| New endpoints and exposure | `GET /health/live`, `GET /health/ready` — both unauthenticated by design (required for Docker healthchecks pre-AUTH-001), no business/PII data returned. |
| Docker safety impact | No destructive command added anywhere; `db-verify.sh` carries the same self-guard pattern as `docker-verify.sh`/`e2e-local.sh`. |
| Risk level | Low |
| Security decision (PASS/FAIL) | PASS |

## Decision (PASS / FAIL)
PASS — every required verification command exited 0, the Identity/Role
schema and seed match the approved boundary exactly (6 roles, 0 default
users), no login/business behavior was introduced, and no destructive
Git/Docker/database operation occurred.

## Remaining Work
- AUTH-001: login, JWT access/refresh tokens, server-side session/revocation
  store, RBAC guards, User-to-Role cardinality policy decision.
- Business modules (Customer Master, Delivery Task, Preparation, Assignment,
  and onward) — all future MVP milestones.
- Audit Log and session tables — explicitly out of scope for this milestone.

## Next Step
**AUTH-001** — Authentication and RBAC per Dispatch Knowledge Topic 11 §21
Implementation Roadmap.

## Recommended Commit Message
```
feat(dispatch): add database and api foundation

Add PostgreSQL/Prisma persistence, database-aware liveness/readiness
endpoints, an initial technical Identity/Role schema (User, Role,
UserRoleAssignment — no login, no default account), idempotent
system-role seed, an Identity/Role repository boundary, migration/seed
tooling (scripts/db-verify.sh), and CI database integration.
```
