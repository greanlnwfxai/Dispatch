# CTO Summary
## Task
MVP-02 — Customer and Task Creation

## Status (PASS / FAIL)
**PASS**

## Scope
Implement the first Dispatch business capability: read-only Customer/
Destination Master search (search-first), and Delivery Task creation,
DRAFT editing, and submission to `WAITING_PREPARATION`, with a mandatory,
server-authoritative, immutable Historical Destination Snapshot. Admin Web
gains Task list/create/detail/edit screens; RBAC and creator/actor
attribution are enforced server-side; AUTH-001 behavior is unchanged.

## Preflight

| Check | Result |
|---|---|
| `git status --short` | Clean at start |
| `git log -1 --oneline --decorate` | `489d8e2 (HEAD -> main, tag: v0.13.0-dispatch-authentication-rbac-foundation, origin/main) feat(dispatch): add authentication and rbac foundation` |
| `git describe --tags --exact-match HEAD` | `v0.13.0-dispatch-authentication-rbac-foundation` — matches expected baseline exactly |
| Docker Compose status | `db`/`api`/`admin-web`/`mobile-pwa` all `Up`/`healthy` |
| API readiness | `GET /health` → `{"status":"ok","service":"dispatch-api","database":"ok"}` |
| Prisma migration status | 2 migrations found, "Database schema is up to date!" |
| `users` | 1 (real operator SUPER_ADMIN) |
| `roles` | 6 (exact approved set) |
| `user_role_assignments` | 1 |
| `auth_sessions` | 1 |
| `refresh_token_records` | 1 |

Confirmed before implementation: working tree clean, HEAD at the expected
AUTH-001 commit/tag, DB and API healthy, the operator-created SUPER_ADMIN
present, exactly the six approved role codes, PostgreSQL still
Docker-network-internal with no host port mapping. No stop condition was
triggered — implementation proceeded.

## Business-Rule Traceability

| ID | How it is implemented |
|---|---|
| BDR-CUSTOMER-001 (Option C, approved) | Task creation always requires a prior `POST /customer-master/search` call; the returned `searchId` is required by `POST /tasks` and any destination-changing `PATCH /tasks/:id` |
| BDR-CUSTOMER-002 (Option B, approved) | Free-text is accepted only with a `freeTextFallbackReason` (`NO_SUITABLE_MASTER`/`AD_HOC_DESTINATION`); it never creates or links a `Customer`/`CustomerDestination` row |
| BDR-CUSTOMER-003 (OPEN — not resolved by this task) | Snapshot columns implement only the approved minimum (destination name, address, Destination Source) plus a documented technical superset (contact name/phone, delivery instructions, location reference, access notes, customer/destination code). The exact mandatory superset remains an open Product-Owner decision — see "BDR Handling" below |
| BDR-TASK-001 (OPEN — not resolved by this task) | `TaskReference` is a fully optional, unbounded child record (`referenceType`/`referenceValue`); no type is mandatory. Duplicate type/value pairs on the same Task are rejected |
| BR-TASK-003 | `validateDestinationSelection` (packages/domain) + `TasksService.resolveDestinationSelection` enforce destination name/address mandatory, Destination Source always recorded, search-first, Free-text-never-auto-links |
| BR-TASK-004 | `plannedDeliveryDate` is nullable in DRAFT, hard-blocked at submission (`PLANNED_DELIVERY_DATE_REQUIRED`) |
| BR-TASK-005 | `TaskReference` is `CONDITIONAL`/advisory — no reference type is enforced (matches BDR-TASK-001's open status) |
| BR-TASK-006 | `createdByUserId`/`updatedByUserId` are non-null FKs to `User`, set server-side from the authenticated principal only |
| BR-TASK-007 | DRAFT is non-operational — no assignment/stock module exists in this milestone at all |
| BR-TASK-008 | `validateDeliveryTaskSubmission` blocks the DRAFT→WAITING_PREPARATION transition on any incomplete core data |
| BR-TASK-009 / BR-DATA-003 | Snapshot columns are populated server-side at create/edit time and never written to once the Task leaves DRAFT (no endpoint accepts a write to a non-DRAFT Task) |
| BR-TASK-010 | Not applicable in this milestone (no Delivery Attempt exists yet) — noted as a future constraint, not implemented as a rule here |
| VR-TASK-001a | `validateDeliveryTaskSubmission`, executed inside the `submit()` transaction against re-read data |

## Technical Decisions

- **Task number format** (`DSP-########`, an 8-digit zero-padded Postgres
  sequence `dispatch_task_number_seq`): not specified anywhere in Dispatch
  Knowledge — a pure technical decision, verified collision-safe under 20
  concurrent generations in `apps/api/test/delivery-task.integration-
  spec.ts`.
- **Search-first evidence** (`CustomerMasterSearch`): expiry (30 min),
  ownership, and MASTER-in-result-set are validated at the create/PATCH
  selection boundary, **and independently re-validated inside the
  `submit()` transaction** against data re-read at submission time
  (ownership, expiry, chronology, and — for MASTER — that the destination
  is both covered by the re-read search's matched set and still an active
  Master record). This closes a blocking review finding raised after the
  original PASS — see "Issues Found" below and
  `validateSubmitSearchEvidence` in `packages/domain/src/index.ts`. Every
  submit-time evidence failure (missing, foreign, expired, out-of-order,
  or uncovered) returns the identical generic `SEARCH_EVIDENCE_INVALID`
  error via `422 Unprocessable Entity`, so the response never discloses
  which specific condition failed — the same anti-disclosure property the
  create/PATCH path already applies. `422` is used only for this category,
  distinct from create/PATCH-time's `400` (a deliberate, documented
  difference, not an inconsistency) and from `400 INCOMPLETE` (business
  completeness) and `409 NOT_DRAFT` (status conflict).
- **Snapshot authority**: for `MASTER`, all snapshot columns are loaded
  from the canonical `Customer`/`CustomerDestination` row server-side,
  discarding any conflicting client-supplied value. For `FREE_TEXT`, the
  client-supplied values (validated/bounded) are themselves the snapshot.
- **Delete policy**: `DeliveryTask → DeliveryTaskItem/TaskReference` is
  `ON DELETE CASCADE` because those rows are child-only draft payload.
  `TaskEvent → DeliveryTask` is `ON DELETE RESTRICT` because status history
  is append-only audit evidence and must not be cascade-deleted. Every other
  new FK (`Customer`, `CustomerDestination`, `CustomerMasterSearch`, `User`)
  is `ON DELETE RESTRICT`, preserving historical traceability.
- **`DeliveryTaskStatus` enum carries all 10 conceptual statuses** (Topic
  04 §5) even though only `DRAFT`/`WAITING_PREPARATION` are reachable —
  avoids a future breaking enum alteration.

## BDR Handling (explicit, not resolved by this task)

- **BDR-CUSTOMER-003** stays **OPEN**. This task implements a technical
  resolution *constrained by* the already-approved minimum
  (BR-TASK-009/BR-DATA-003: destination name + address + Destination
  Source) plus the documented candidate superset from Topic 05 §8
  (contact name/phone, delivery instructions, location reference, access
  notes, customer/destination code) as *storage capacity*, not as an
  approved mandatory set. No claim of business authority is made.
- **BDR-TASK-001** stays **OPEN**. `TaskReference` is deliberately
  flexible/unbounded so a future, Product-Owner-approved policy can make
  specific reference types mandatory without a Task identity/schema
  rewrite. No reference type is treated as mandatory anywhere in this
  implementation.

## Migration

Initial MVP-02 migration:
`apps/api/prisma/migrations/20260722135828_customer_and_task_creation/migration.sql`

- Authored offline via `prisma migrate diff --from-migrations ... --to-schema-datamodel ... --shadow-database-url <ephemeral throwaway local Postgres container, never the real Dispatch DB>` — no `prisma migrate dev`/`reset` was ever run against real data.
- Purely additive: 3 new enums, 7 new tables, indexes, foreign keys, one new Postgres sequence, and two new CHECK constraints (destination-source consistency; positive planned quantity) — reviewed by hand for zero DROP/TRUNCATE/DELETE.
- Applied to the real database via `prisma migrate deploy` (never `migrate dev`), after rebuilding the `api` image so the migration file was present in the running container (`docker compose up -d --build api`).
- Original applied checksum was not changed during remediation:
  `76676e24881bb176aca058164760e6586a813cbc62150bcc2d21dbd0b87b3b98`.

Remediation migration:
`apps/api/prisma/migrations/20260723093000_task_event_delete_restrict/migration.sql`

- Created after the independent Codex review found that
  `TaskEvent -> DeliveryTask ON DELETE CASCADE` conflicted with append-only
  audit/status-history semantics.
- Performs only `DROP CONSTRAINT task_events_task_id_fkey` and recreates the
  same FK as `ON DELETE RESTRICT ON UPDATE CASCADE`; it removes no table,
  column, row, enum, index, or unrelated constraint.
- Applied via `prisma migrate deploy`; `prisma migrate status` reports all
  4 migrations applied and the database schema up to date.

## Database Before/After Counts

| Table | Before | After |
|---|---|---|
| `users` | 1 | 1 (unchanged — operator untouched) |
| `roles` | 6 | 6 (unchanged, exact approved set) |
| `user_role_assignments` | 1 | 1 (unchanged) |
| `auth_sessions` | 1 | 1 (unchanged) |
| `refresh_token_records` | 1 | 1 (unchanged) |
| `customers` | — (table did not exist) | 0 |
| `customer_destinations` | — | 0 |
| `customer_master_searches` | — | 0 |
| `delivery_tasks` | — | 0 |
| `delivery_task_items` | — | 0 |
| `task_references` | — | 0 |
| `task_events` | — | 0 |

All 7 new tables exist and are empty (no seed, no automatic fixture) — the
operator account and existing AUTH-001 data are byte-for-byte unchanged.

## API

| Method | Path | RBAC | Notes |
|---|---|---|---|
| POST | `/customer-master/search` | SUPER_ADMIN, ADMIN, DISPATCHER | Bounded query (1-120 chars), `take: 20`, active-only, records `CustomerMasterSearch` evidence |
| POST | `/tasks` | SUPER_ADMIN, ADMIN, DISPATCHER | Creates DRAFT; server generates `taskNumber` and sets creator from the principal |
| GET | `/tasks` | SUPER_ADMIN, ADMIN, DISPATCHER, STOCK, MANAGEMENT_AUDITOR | Paginated, filterable (status/taskNumber/date range) |
| GET | `/tasks/:id` | same as list | Returns snapshot + items + references + status history |
| PATCH | `/tasks/:id` | SUPER_ADMIN, ADMIN, DISPATCHER | DRAFT only (409 otherwise); explicit allowlist, no mass assignment |
| POST | `/tasks/:id/submit` | SUPER_ADMIN, ADMIN, DISPATCHER | DRAFT → WAITING_PREPARATION, transactional; re-reads Task/items/search evidence and re-validates both business completeness and search-evidence ownership/expiry/coverage (`422` on evidence failure) |

No `DELETE /tasks/:id` exists. `INTERNAL_DELIVERY_EMPLOYEE` has no route
access in this milestone (assignment/record-scope is not implemented
yet). SUPER_ADMIN is still subject to every business-completeness check —
authorization never bypasses validation.

## Admin Web

Routes: `/tasks` (list), `/tasks/new` (search-first creation flow),
`/tasks/[id]` (detail — snapshot, items, references, status history,
Submit with explicit `window.confirm`), `/tasks/[id]/edit` (DRAFT-only
editing, blocked with a friendly message once submitted). Create/Edit/
Submit actions are hidden client-side for read-only roles; direct URL
access is still enforced server-side (403). `auth-context.tsx` gained an
`authFetch` helper (in-memory access token + one-shot 401→refresh→retry)
so business pages can call the API — the AUTH-001 login/refresh/logout
cookie/token behavior itself is unchanged. No access token, refresh token,
or draft data is ever written to localStorage/sessionStorage/IndexedDB
(enforced by `scripts/verify.sh`'s existing token-storage scanner, which
still passes).

## RBAC Matrix

| Role | Search | Create/Edit/Submit | Read |
|---|---|---|---|
| SUPER_ADMIN | ✅ | ✅ | ✅ |
| ADMIN | ✅ | ✅ | ✅ |
| DISPATCHER | ✅ | ✅ | ✅ |
| STOCK | ❌ | ❌ | ✅ |
| MANAGEMENT_AUDITOR | ❌ | ❌ | ✅ |
| INTERNAL_DELIVERY_EMPLOYEE | ❌ | ❌ | ❌ |

## Customer Search-First Enforcement

`CustomerMasterSearch` is a server-created, server-verifiable evidence
record (id, `searchedByUserId`, normalized query, matched destination ids,
result count, `searchedAt`, `expiresAt` — never a secret/token/cookie
value). It has exactly one creation path (`CustomerMasterService.search`,
called from `POST /customer-master/search`), which always sets
`searchedByUserId` from the authenticated principal server-side — so
"server-created" is a structural guarantee, not a field that needs a
runtime check. `TasksService.resolveDestinationSelection` requires this
evidence for every destination selection (MASTER or FREE_TEXT) at
create/PATCH time and validates ownership, non-expiry (30-minute TTL),
and — for MASTER — that the selected `customerDestinationId` is a member
of that specific search's matched set, re-verified against the live
active-Master table. A cross-user or expired `searchId` is rejected with
one generic message.

**Submit-time revalidation (blocking review finding fix).** The
create/PATCH-time check above is necessary but not sufficient: a search
can expire, or a Master destination can be deactivated, in the interval
between DRAFT save and submission. `PrismaDeliveryTaskRepository.submit`
now re-reads the Task's linked `CustomerMasterSearch` row (by
`customerSearchId`) and, for MASTER, a fresh active-Customer/
active-CustomerDestination lookup, all inside the same transaction as the
status transition, and runs the pure `validateSubmitSearchEvidence`
function (`packages/domain/src/index.ts`) against that re-read data
before any write occurs. Checked: evidence exists; belongs to the
submitting user; has not expired at the transaction's current time;
`searchedAt` is not later than submission time; and, for MASTER, the
selected `customerDestinationId` is both present in the re-read search's
matched-id set and still an active Master record. This never overwrites
the Task's already-stored Historical Destination Snapshot — the
active-Master re-check is existence-only, and a later Master edit never
silently changes a previously frozen snapshot (BR-TASK-009/BR-DATA-003).
On failure, no status change, `submittedAt` change, status-history event,
or snapshot/item/reference mutation occurs (verified by the atomicity
tests below), and the response is a generic `SEARCH_EVIDENCE_INVALID`
error via `422`. Validation is identical for every role, including
SUPER_ADMIN.

## Historical Snapshot Implementation

Columns on `DeliveryTask`: `customerName`, `destinationName`, `address`
(all `NOT NULL`), `contactName`/`contactPhone`/`deliveryInstructions`/
`locationReference`/`accessNotes` (nullable), `customerCodeSnapshot`/
`destinationCodeSnapshot` (nullable, MASTER only), `snapshotCreatedAt`.
For MASTER, values are loaded from the canonical row at
create/PATCH time; for FREE_TEXT, the validated client input is the
snapshot. Immutability is enforced structurally — no endpoint ever writes
these columns once `status !== DRAFT`. Verified in
`apps/api/test/delivery-task.integration-spec.ts` by updating the Master
record after Task creation and re-reading the Task unchanged.

## Task Number Implementation

`dispatch_task_number_seq` (Postgres sequence) + `formatDeliveryTaskNumber`
(packages/domain, pure function) → `DSP-00000001` style, 8-digit
zero-padded. `nextval()` is atomic under concurrency; `delivery_tasks
.task_number` carries a `UNIQUE` constraint as a backstop. Verified with
20 concurrent `next()` calls in the integration suite (all unique, correct
format).

## Files Created

Exact Git scope at final local review (**39 files**):

```text
apps/admin-web/src/app/tasks/[id]/edit/page.tsx
apps/admin-web/src/app/tasks/[id]/page.tsx
apps/admin-web/src/app/tasks/__tests__/page.test.tsx
apps/admin-web/src/app/tasks/_components/destination-selector.tsx
apps/admin-web/src/app/tasks/_components/goods-lines-editor.tsx
apps/admin-web/src/app/tasks/_components/roles.ts
apps/admin-web/src/app/tasks/_components/task-references-editor.tsx
apps/admin-web/src/app/tasks/new/__tests__/page.test.tsx
apps/admin-web/src/app/tasks/new/page.tsx
apps/admin-web/src/app/tasks/page.tsx
apps/admin-web/src/lib/tasks-client.ts
apps/api/prisma/migrations/20260722135828_customer_and_task_creation/migration.sql
apps/api/prisma/migrations/20260723093000_task_event_delete_restrict/migration.sql
apps/api/src/customer-master/customer-master.controller.ts
apps/api/src/customer-master/customer-master.module.ts
apps/api/src/customer-master/customer-master.service.spec.ts
apps/api/src/customer-master/customer-master.service.ts
apps/api/src/customer-master/dto/customer-master-search.dto.ts
apps/api/src/infrastructure/database/repositories/prisma-customer-master-search.repository.ts
apps/api/src/infrastructure/database/repositories/prisma-customer-master.repository.ts
apps/api/src/infrastructure/database/repositories/prisma-delivery-task.repository.spec.ts
apps/api/src/infrastructure/database/repositories/prisma-delivery-task.repository.ts
apps/api/src/infrastructure/database/repositories/prisma-task-number.generator.ts
apps/api/src/tasks/dto/create-delivery-task.dto.ts
apps/api/src/tasks/dto/delivery-task-item.dto.ts
apps/api/src/tasks/dto/list-delivery-tasks-query.dto.ts
apps/api/src/tasks/dto/task-reference.dto.ts
apps/api/src/tasks/dto/update-delivery-task-draft.dto.ts
apps/api/src/tasks/tasks.controller.ts
apps/api/src/tasks/tasks.module.ts
apps/api/src/tasks/tasks.service.spec.ts
apps/api/src/tasks/tasks.service.ts
apps/api/test/customer-master.integration-spec.ts
apps/api/test/delivery-task.integration-spec.ts
apps/api/test/tasks.e2e-spec.ts
docs/CTO_SUMMARY_MVP_02.md
e2e/scripts/create-task-fixture.cjs
e2e/scripts/delete-task-fixture.cjs
e2e/tests/task-creation.spec.ts
```

## Files Modified

Exact Git scope at final local review (**16 files**):

```text
Dispatch Knowledge/11 - Technical Architecture และแผนพัฒนา MVP.md
README.md
apps/admin-web/src/app/auth-context.tsx
apps/admin-web/src/app/page.tsx
apps/api/prisma/schema.prisma
apps/api/src/app.module.ts
apps/api/src/infrastructure/database/repositories/repositories.module.ts
apps/api/test/identity-role.integration-spec.ts
docs/SECURITY_REVIEW_LOG.md
packages/contracts/src/index.test.ts
packages/contracts/src/index.ts
packages/domain/src/index.test.ts
packages/domain/src/index.ts
packages/shared-types/src/index.test.ts
packages/shared-types/src/index.ts
scripts/db-verify.sh
```

## Dependency Changes

None. No new npm package was added to any workspace.

## Verification Results

| Command | Result |
|---|---|
| `npm run prisma:generate` (workspace) | PASS |
| `npm run prisma:validate` (workspace) | PASS |
| Migration SQL hand-review | PASS — zero DROP/TRUNCATE/DELETE |
| `./scripts/verify.sh` | **PASS** |
| `./scripts/docker-verify.sh` | **PASS** |
| `./scripts/db-verify.sh` | **PASS** |
| `./scripts/api-smoke-test.sh` | **PASS** |
| `./scripts/mobile-verify.sh` | **PASS** |
| `./scripts/security-review.sh` | **PASS** (automated checks; manual checklist reviewed below) |
| `./scripts/e2e-local.sh` | **PASS** (5/5 — foundation suite + new MVP-02 Task creation flow) |

Unit tests: 119 passed (apps/api) + 31 (packages/domain) + 12
(packages/shared-types) + 10 (packages/contracts) + 14 (apps/admin-web).
apps/api and packages/domain each grew by 7/9 tests respectively during
the blocking-review-finding remediation (submit-time search-evidence
revalidation) — see "Issues Found". A later consolidated remediation pass
updated the repository mock fixture for the new row-lock query; the
lock-ordering behavior itself is proven by real PostgreSQL concurrency
tests and direct implementation inspection.
Integration tests: 44 passed (5 suites, incl. 2 MVP-02 suites — 4
submit-time evidence tests plus 4 real PostgreSQL row-lock/FK tests added
during remediation).
E2E (supertest): 29 passed (3 suites, incl. `tasks.e2e-spec.ts` — 3 new
tests added during remediation).
Playwright: 5 passed (foundation + MVP-02 flow, re-verified end-to-end
through submit after remediation).

## Docker Verification Result

`db`, `api`, `admin-web`, `mobile-pwa` all rebuilt (`docker compose up -d
--build`) and reported `healthy`/`Up`. `GET /health` and `GET /health/live`
returned expected bodies. Admin Web and Mobile/PWA both reachable.
PostgreSQL confirmed still Docker-network-internal with no host port
mapping. Stack left running per instructions.

## Security Review

| Field | Description |
|---|---|
| Auth impact | None — AUTH-001 login/refresh/logout/guards unchanged; verified via unchanged `auth.e2e-spec.ts` still passing |
| RBAC impact | New `RolesGuard`/`@Roles(...)` usage on 6 new routes, roles resolved from PostgreSQL per-request (unchanged mechanism); 401/403 verified for every role combination. Submit-time search-evidence ownership is additionally enforced (only the user who ran the search may submit a Task built on it) — see "Issues Found" and "Remaining Work" for the one known asymmetry this introduces against DRAFT edit's any-DISPATCHER-may-edit model |
| Data privacy impact | Customer contact fields (name/phone) are only returned to authorized roles (search/read RBAC); no PII in logs |
| Password/token/hash impact | None — no new credential material introduced |
| Mobile security impact | None — Mobile/PWA untouched, no MVP-02 UI added there |
| Dependency/advisory impact | None — no new dependency; `npm audit` 0 vulnerabilities |
| Secrets/logging check | No secret/token/password logged; `secret-scan.sh` WARN reviewed (doc comments + negative test assertions only) |
| New endpoints protected | All 6 new routes require authentication + role; verified by e2e 401/403 tests |
| Docker safety impact | None — no Dockerfile/compose change; only non-destructive rebuild/restart used |
| Risk level | Low |
| Security decision (PASS/FAIL) | **PASS** |

## Decision (PASS / FAIL)
**PASS**

## Issues Found

1. **Pre-existing stale "0 Users" assertions** in `scripts/db-verify.sh`
   and `apps/api/test/identity-role.integration-spec.ts` — both were
   written before AUTH-001's operator-bootstrap CLI existed, and would
   spuriously fail now that a real operator SUPER_ADMIN legitimately
   exists (as this task's own instructions state). **Fixed**: both now
   compare against a captured pre-suite baseline instead of a hardcoded
   zero. This is a correction of a stale foundation-era assumption, not an
   MVP-02 regression, and does not weaken either check — they still fail
   loudly on any unexpected User/session change.
2. A first-pass typo in `resolveDestinationSelection`'s destination-source
   consistency check (`Prisma.DeliveryTaskUpdateInput` used instead of
   `Prisma.DeliveryTaskUncheckedUpdateInput` for scalar FK fields) was
   caught by `tsc` during `npm run typecheck` and fixed before any test
   ran.
3. A test-file bug (`.parentElement.querySelector` on a label element that
   was already the target, causing two Free-text fields to resolve to the
   same input) was caught by a failing Admin Web test and fixed.
4. **Blocking review finding (post-original-PASS): submit-time search
   evidence was not re-validated.** The original implementation validated
   Customer Master search evidence (ownership, expiry, MASTER-in-result-
   set) only at the create/PATCH selection boundary and documented that
   `submit()` deliberately did not re-check it — a DRAFT Task could
   transition to `WAITING_PREPARATION` on evidence that had since expired,
   been superseded by another user's search, or (for MASTER) referenced a
   destination no longer covered by any valid search or no longer active.
   A blocking code review correctly identified this as insufficient: §4.3
   "search-first" must hold *at submission*, not only at selection.
   **Fixed**: `PrismaDeliveryTaskRepository.submit` now re-reads the
   Task's `CustomerMasterSearch` row and, for MASTER, a fresh
   active-Customer/active-CustomerDestination lookup, inside the same transaction as the status transition, and runs the new pure
   `validateSubmitSearchEvidence` function (`packages/domain/src/index.ts`)
   before any write. Ownership, expiry, chronology (`searchedAt` not later
   than submission time), and — for MASTER — matched-set coverage plus
   active-record existence are all checked; the already-stored Historical
   Destination Snapshot is never rewritten from this re-read data
   (existence-only check). Every failure mode returns the identical
   generic `SEARCH_EVIDENCE_INVALID` error via `422 Unprocessable Entity`
   (distinct from create/PATCH-time's `400`, a deliberate documented
   difference — see "Technical Decisions"), and no partial mutation
   occurs on failure (verified by a new mocked-transaction unit-test file,
   `prisma-delivery-task.repository.spec.ts`, plus new database-
   integration and e2e coverage). Validation is unchanged for
   SUPER_ADMIN — authorization never bypasses it. This closes the
   blocking review finding.
5. **Independent Codex review blocking findings (2026-07-23): stale
   DRAFT reads could race with edit/submit, duplicate submit events were
   possible under concurrent submit/submit, and `TaskEvent -> DeliveryTask`
   used `ON DELETE CASCADE` despite append-only audit/status-history
   requirements.** **Fixed in one consolidated remediation pass**:
   `PrismaDeliveryTaskRepository.updateDraft` and `submit` now acquire a
   PostgreSQL row lock on the target `delivery_tasks` row with
   `SELECT ... FOR UPDATE` at the start of their existing interactive
   transactions, then re-read current Task state and all validation inputs
   after the lock is held. `updateDraft` rejects non-DRAFT state before any
   parent/child/event write; a queued edit cannot mutate a Task already
   submitted by a competing transaction. `submit` revalidates DRAFT status,
   required fields, goods lines, CustomerMasterSearch ownership/expiry/
   chronology/source, MASTER coverage and active Master status, FREE_TEXT
   fallback reason, and null Master FKs before any write; concurrent
   submit/submit produces exactly one transition and exactly one
   `TASK_SUBMITTED` event. The original applied migration was not edited;
   the new additive migration
   `20260723093000_task_event_delete_restrict` changes only the TaskEvent FK
   to `ON DELETE RESTRICT`. Real PostgreSQL concurrency tests and a
   restrictive-FK integration test were added in
   `apps/api/test/delivery-task.integration-spec.ts`.

No blocking review finding remains uncorrected locally. Remote CI is still
NOT YET RUN.

## Risk (Low / Medium / High)
**Low** — additive schema only, no destructive migration, all changes
covered by unit/integration/e2e/Playwright tests, verified zero data
residue and zero impact on the operator account/roles across every
verification run.

## Remaining Work

- BDR-TASK-001 and BDR-CUSTOMER-003 remain open Product-Owner decisions
  (see "BDR Handling").
- `POST /customer-master/search` has no dedicated rate limit beyond
  requiring authentication + role (unlike `/auth/login`'s explicit
  throttle) — acceptable for this milestone since it requires prior
  authentication, but worth a future dedicated throttle if abuse is
  observed.
- Customer Master administration (create/edit/delete/merge/import),
  Preparation, Assignment, Delivery/GPS/Evidence, Returns, Reopen,
  Emergency Override, Correction Action, and Reporting remain unimplemented
  per Topic 11 §21 roadmap.
- Production secret/cookie-domain configuration remains open per
  `docs/CTO_SUMMARY_AUTH_001.md`.
- **Submit-time search-evidence ownership introduces an asymmetry with
  DRAFT editing.** `PATCH /tasks/:id` allows any DISPATCHER/ADMIN/
  SUPER_ADMIN to edit any DRAFT Task (Dispatcher role sees "all tasks" per
  Topic 03's operational-scope model), but as of this remediation,
  `POST /tasks/:id/submit` now requires that the search evidence backing
  the Task's current destination selection was run by the *same user*
  attempting to submit. Concretely: if Dispatcher A creates a Task and
  Dispatcher B later edits it (re-selecting a destination using B's own
  search), B's search becomes the Task's evidence and either A or B may
  then submit; but if B edits only non-destination fields (leaving A's
  original search linked), only A can submit — B's submit attempt is
  rejected with the same generic `SEARCH_EVIDENCE_INVALID` error as an
  expired/foreign search, not a distinct "not your search" message. This
  is a direct, literal implementation of the review finding's requirement
  ("belongs to the authenticated submitting user") and is not a bug, but
  it is a behavior a future milestone or Product Owner review should be
  aware of if multi-user hand-off of a single DRAFT Task becomes a
  workflow requirement — a scenario not exercised by this milestone's
  tests (all of which are single-user per Task).
- No dedicated optimistic-version column exists for DeliveryTask yet. MVP-02
  uses PostgreSQL row-level locking for the two state-mutating repository
  methods that can contend today; a broader aggregate version remains a
  future design option when later milestones add assignment/preparation/
  delivery mutations.

## Next Step
Per Dispatch Knowledge Topic 11 §21 Implementation Roadmap: **MVP-03 —
Preparation and Pre-loading Evidence** (`ConfirmPreparation`,
`PreparationCorrectionRecord`), gated on BDR-PREP-002/BDR-PREP-003.

## Remote CI Status
**NOT YET RUN** — remote GitHub Actions status can only be known once the
user pushes and reports the result.

## Recommended Commit Message
```
feat(dispatch): add customer and task creation

Implements MVP-02: read-only Customer/Destination Master search
(search-first) and Delivery Task creation/editing/submission
(DRAFT -> WAITING_PREPARATION) with an immutable, server-authoritative
Historical Destination Snapshot. Adds Admin Web Task list/create/detail/
edit screens. BDR-TASK-001 and BDR-CUSTOMER-003 remain open business
decisions, implemented only as flexible/minimum technical resolutions.
Also fixes two pre-existing "0 Users" assertions (db-verify.sh,
identity-role.integration-spec.ts) that were stale after AUTH-001's
operator bootstrap.

Includes a same-branch remediation of a blocking review finding:
SubmitDeliveryTask now re-reads and revalidates Customer Master search
evidence (ownership/expiry/chronology/MASTER-coverage) inside the same transaction as the DRAFT -> WAITING_PREPARATION status transition, not
only at create/PATCH selection time. Failed validation performs no
partial mutation and returns a generic 422 SEARCH_EVIDENCE_INVALID
error. See "Issues Found" for detail.

Includes a consolidated 2026-07-23 remediation of three independent Codex
review blockers: updateDraft/submit now serialize with a PostgreSQL
DeliveryTask row lock before fresh validation reads; concurrent submit can
append only one TASK_SUBMITTED event; and TaskEvent audit history is
protected by an additive ON DELETE RESTRICT FK migration. Remote CI remains
NOT YET RUN.
```
