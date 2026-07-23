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

## MVP-02 — 2026-07-22

### No new dependencies added — no HIGH/CRITICAL findings

MVP-02 introduces no new npm dependency in any workspace (Prisma schema
additions and NestJS/Next.js code only use packages already present since
AUTH-001). `npm audit` after the full change: **0 vulnerabilities**. No
`.security-accepted-risks` entry required.

### Search-first evidence (`CustomerMasterSearch`) — no secret/token material, short-lived, revalidated at submit

The server-verifiable search-evidence record stores only
`searchedByUserId`, a bounded normalized query string, matched result ids,
a count, and timing fields — never a raw request, cookie, or token value.
Expiry (30 minutes) and ownership are enforced at the point a destination
is selected (create/edit), and a cross-user or expired `searchId` is
rejected with a single generic message so the response never discloses
whether a foreign `searchId` exists. Covered by
`src/tasks/tasks.service.spec.ts` and `apps/api/test/tasks.e2e-spec.ts`.

**Updated 2026-07-23 (blocking review finding remediation):** the
create/edit-time check above is necessary but not sufficient — evidence
can expire, or a MASTER destination can be deactivated, between DRAFT
save and submission. `PrismaDeliveryTaskRepository.submit` now re-reads
the linked `CustomerMasterSearch` row and, for MASTER, a fresh
active-Customer/active-CustomerDestination lookup, inside the same
transaction as the DRAFT → WAITING_PREPARATION status transition, and
rejects (via the pure `validateSubmitSearchEvidence` function in
`packages/domain`) before any write if the evidence is missing, foreign,
expired, out of chronological order, or — for MASTER — no longer covered
by the search's matched set or no longer active. Every failure mode
returns the identical generic `SEARCH_EVIDENCE_INVALID` error via `422`,
preserving the same anti-disclosure property as the create/edit-time
check. See `docs/CTO_SUMMARY_MVP_02.md` "Issues Found" for the full
finding and fix, and the new
`apps/api/src/infrastructure/database/repositories/prisma-delivery-task.repository.spec.ts` for atomicity coverage (no write occurs on a failed
revalidation).

### RBAC — resolved from PostgreSQL per-request, never from JWT/client claims

`TasksController` and `CustomerMasterController` reuse the existing
AUTH-001 `RolesGuard` + `@Roles(...)` pattern unchanged; authorization
continues to come from `JwtAuthenticationGuard`'s per-request database
re-resolution of role codes (see `apps/api/src/auth/guards/jwt-
authentication.guard.ts`), never from the access token's own claims.
Verified via `apps/api/test/tasks.e2e-spec.ts`: 401 with no token, 403 for
an insufficient role (STOCK/INTERNAL_DELIVERY_EMPLOYEE/MANAGEMENT_AUDITOR
attempting create), and that SUPER_ADMIN-equivalent authorization never
bypasses business-completeness validation at submit.

### Mass assignment — explicit DTO allowlists, `forbidNonWhitelisted` global pipe

`CreateDeliveryTaskDto`/`UpdateDeliveryTaskDraftDto` enumerate every
accepted field explicitly; the existing global `ValidationPipe({
whitelist: true, forbidNonWhitelisted: true })` (unchanged from AUTH-001)
rejects any unknown property. `id`, `taskNumber`, `createdByUserId`, and
`status` can never be set via PATCH — they are not present in the DTO at
all, so the global pipe rejects any attempt to submit them.

### IDOR / IDOR-adjacent (searchId reuse, IDs) — reviewed, no finding

`GET /tasks/:id` and `PATCH /tasks/:id` take an opaque UUID and are gated
by the same read/write RBAC roles as the list endpoint (no per-Task owner
check beyond role, matching Dispatch Knowledge Topic 03's operational-scope
model for Dispatcher/Admin/Super Admin, who see "all tasks" per the
approved permission matrix). A `searchId` belonging to a different user is
rejected (see above). `customerDestinationId` supplied for a MASTER
selection is re-verified server-side against both the active-Master table
and the specific search's matched-id set — a client cannot attach an
arbitrary/foreign destination id to a Task.

**Updated 2026-07-23:** `POST /tasks/:id/submit` now applies the same
ownership check as create/edit (see "Search-first evidence" above),
re-checked against the Task's currently-linked search at submit time. One
noted asymmetry: `PATCH` still allows any DISPATCHER/ADMIN/SUPER_ADMIN to
edit any DRAFT Task per the "all tasks" model, but `submit` requires the
linked search's `searchedByUserId` to match the submitting user. This is a
deliberate, literal implementation of the review finding's ownership
requirement, not an oversight — see `docs/CTO_SUMMARY_MVP_02.md`
"Remaining Work" for the full note on when this could matter for a future
multi-user hand-off workflow.

### Snapshot integrity — server-authoritative, immutable once non-DRAFT

For `destinationSource: "MASTER"`, all snapshot columns are loaded from
the canonical `Customer`/`CustomerDestination` rows server-side
(`TasksService.resolveDestinationSelection`) — conflicting client-supplied
values are discarded, not merged. No endpoint writes snapshot columns once
a Task leaves `DRAFT` (`PATCH` is rejected with 409 for a non-DRAFT Task).
Verified by `apps/api/test/delivery-task.integration-spec.ts` (`Task
snapshot remains unchanged after Master record update`) and
`apps/api/test/tasks.e2e-spec.ts` (edit-after-submit rejected).

**Updated 2026-07-23 (independent Codex blocking review remediation):**
`PrismaDeliveryTaskRepository.updateDraft` and `submit` now acquire a
PostgreSQL row lock on the target `delivery_tasks` row with
`SELECT ... FOR UPDATE` at the start of their existing interactive
transactions. Both methods then re-read current Task state after the lock is
held and validate against that fresh data before any write. A queued edit
therefore observes a Task already submitted by a competing transaction and
fails without parent, destination snapshot, item, reference, or
`TASK_UPDATED` mutation.

### Task status-history audit FK — RESTRICT, not cascade

The independent Codex review found that `TaskEvent -> DeliveryTask ON DELETE
CASCADE` was inconsistent with append-only audit/status-history
requirements. The already-applied
`20260722135828_customer_and_task_creation` migration was not edited. The
new additive migration
`apps/api/prisma/migrations/20260723093000_task_event_delete_restrict/migration.sql`
only drops and recreates `task_events_task_id_fkey` as `ON DELETE RESTRICT
ON UPDATE CASCADE`; it deletes no data and removes no table, column, enum,
index, or unrelated constraint. Covered by a real PostgreSQL integration
test that direct parent `DeliveryTask` deletion is rejected while a
`TaskEvent` exists.

### Submit concurrency — one transition, one event

`submit` uses the same row-lock pattern as `updateDraft`: lock first,
re-read Task/items/references/search evidence after the lock, validate DRAFT
state and all submission/search-evidence invariants, then transition to
`WAITING_PREPARATION` and append `TASK_SUBMITTED`. Real PostgreSQL
concurrency tests coordinate independent connections so two submitters block
on the same row; exactly one succeeds and exactly one `TASK_SUBMITTED` event
is persisted. SUPER_ADMIN follows the same invariants.

### Search/enumeration abuse — bounded query, bounded result set, bounded rate by existing global throttle

`CustomerMasterSearchDto.query` is length-bounded (1-120); the repository
always applies `take: 20`. No endpoint returns an unbounded dump of
`Customer`/`CustomerDestination`. `POST /customer-master/search` is not
additionally throttled beyond the existing per-route defaults — flagged
as a remaining-work item (see CTO Summary), not a FAIL: it requires
authentication and an authorized role first, unlike the public
`/auth/login` endpoint that AUTH-001 explicitly rate-limits.

### Error handling — generic messages only, no Prisma/SQL/stack leakage

Every thrown exception in `TasksService`/`CustomerMasterService` uses a
fixed, generic message (e.g. "Invalid or expired Customer Master search
reference."); Nest's default exception filter sanitizes any uncaught
error into a generic 500. Verified by
`apps/api/test/tasks.e2e-spec.ts` (asserts response bodies never match
`stack|passwordHash|prisma|postgres`).

### Database integration/e2e/Playwright tests — verified clean residue

`apps/api/test/customer-master.integration-spec.ts`,
`apps/api/test/delivery-task.integration-spec.ts`,
`apps/api/test/tasks.e2e-spec.ts`, and `e2e/tests/task-creation.spec.ts`
each create only their own uniquely-scoped test Users/Customers/
Destinations/Searches/Tasks and delete exactly those rows afterward.
Verified via direct `psql` counts after a full local run of every
verification script: `customers`=0, `customer_destinations`=0,
`customer_master_searches`=0, `delivery_tasks`=0, `delivery_task_items`=0,
`task_references`=0, `task_events`=0, `users`/`auth_sessions`/
`refresh_token_records` returned to their pre-suite baseline (the real
operator's own rows) — no residue, no impact on the operator account or
the six seeded roles.

**Updated 2026-07-23:** the new submit-time revalidation tests in
`delivery-task.integration-spec.ts` (foreign-user search evidence) and
`tasks.e2e-spec.ts` (foreign-user search evidence, expired search
evidence) create one additional uniquely-scoped test User each; both
files track and delete exactly those rows in `afterAll` (after the
`CustomerMasterSearch`/`DeliveryTask` rows referencing them, respecting
the `onDelete: Restrict` FK). Re-verified zero residue after a full local
run including these new tests. `prisma-delivery-task.repository.spec.ts`
uses a fully mocked Prisma transaction client (no real database
connection), so it has no residue surface at all.

**Updated 2026-07-23 (consolidated remediation pass):** real PostgreSQL
tests were added for concurrent submit/submit, submit-winning edit/submit,
edit-winning edit/submit, and direct parent delete rejection under the
restrictive TaskEvent FK. Test cleanup deletes only test-owned rows and now
removes test-owned `task_events` before test-owned `delivery_tasks`, in FK
safe order. Remote CI remains **NOT YET RUN**.

### Pre-existing stale-baseline assertions found and fixed (not an MVP-02 regression)

`scripts/db-verify.sh` and `apps/api/test/identity-role.integration-
spec.ts` both hardcoded "User count must be exactly 0", written before
AUTH-001's operator bootstrap CLI existed. With a real operator
SUPER_ADMIN now present (as this task's instructions state explicitly),
both would have spuriously failed regardless of MVP-02's own changes.
Fixed to compare against a captured pre-suite baseline instead of a
hardcoded zero — see `docs/CTO_SUMMARY_MVP_02.md` Issues Found. No
security regression: the checks still fail loudly if migrate/seed/tests
ever create an unexpected User or leave a residual session.

**No entries in `.security-accepted-risks` were required for MVP-02** — no
HIGH/CRITICAL finding, accepted or otherwise.

---

## MVP-03 — 2026-07-23

### No new dependencies added — no HIGH/CRITICAL findings

MVP-03 adds Prisma schema, NestJS code, Admin Web code, and tests using
dependencies already present in the workspace. `./scripts/security-review.sh`
reported no HIGH/CRITICAL dependency findings. No `.security-accepted-risks`
entry was required.

### Pre-loading evidence storage — private development adapter, no public bucket or host port

TDR-STORAGE-001 is resolved for MVP-03 as a technical implementation
decision: a filesystem-backed development adapter mounted at
`/var/lib/dispatch/evidence` on a persistent Docker named volume. The API is
the only access path. No evidence host port, public bucket, public object URL,
or signed URL is exposed. Production remains targeted at private
S3-compatible object storage behind the same storage interface.

Object keys are opaque (`preparation/{preparationId}/{uuid}.{ext}`), never
derived from original filenames, and validated by both application regex and
database CHECK constraint. The storage adapter resolves paths under its root
and rejects traversal before any read/delete/write.

### Upload validation — MIME spoofing, oversized uploads, and multipart abuse reviewed

`POST /tasks/:id/preparation/evidence` accepts exactly one multipart file
field (`photo`) with bounded file size, field count, and part count. JPEG,
PNG, and WebP are accepted only when the declared MIME type and magic bytes
match. SHA-256 is calculated server-side over the original bytes; raw image
bytes and object keys are not logged or returned in normal API responses.

### Evidence retrieval — authenticated and authorized every request

`GET /tasks/:id/preparation/evidence/:evidenceId` reuses the authenticated
RBAC guard and verifies the evidence belongs to the requested Task before
opening storage. Responses use sanitized attachment filenames and
`Cache-Control: private, no-store`. Object storage paths/keys remain server
internal.

### Object/database consistency — exact compensating cleanup only

The evidence service writes a newly generated object first, then creates
metadata and the TaskEvent inside a locked transaction. If metadata creation
or state validation fails after the object write, the service deletes only
that exact newly generated object key. Tests verify valid upload,
MIME/magic mismatch rejection, checksum metadata, private retrieval, and zero
residue after cleanup.

### RBAC and state guards — no Super Admin business bypass

Preparation write actions are restricted to `STOCK`, `ADMIN`, and
`SUPER_ADMIN`; read-only roles cannot mutate. Correction creation is
`ADMIN` only; review is `SUPER_ADMIN` only. `INTERNAL_DELIVERY_EMPLOYEE` has
no MVP-03 access because Assignment/record scope is not implemented. All
state transitions still validate current Task state after PostgreSQL row
locking, so authorization never bypasses business invariants.

### Browser storage — evidence kept in memory only

Admin Web evidence upload uses the browser `File` object and Blob preview
URLs only. Blob URLs are revoked; no customer/preparation/evidence data is
written to localStorage, sessionStorage, or IndexedDB. The existing static
scanner and Playwright flow passed.

### Known scanner warning — literal `DATABASE_URL` references reviewed

`./scripts/security-review.sh` reports a WARN for literal `DATABASE_URL`
strings in comments/tests and existing Prisma-service documentation. Manual
review confirmed these are variable names or negative assertions only, not
connection-string values. No secret value was committed.

**No entries in `.security-accepted-risks` were required for MVP-03** — no
HIGH/CRITICAL finding, accepted or otherwise.

---

<!-- Future accepted-risk entries go below this line, in the format described
     in docs/SECURITY_PATCH_POLICY.md -->
