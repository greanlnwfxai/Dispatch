# CTO Summary — MVP-04: Delivery Task Assignment

## 1. Preflight

- Baseline branch: `main`
- Baseline commit: `1a37b4c7c29f8b4e2e379b78c2e87484ab7c4a01`
- Baseline tag: `v0.15.0-dispatch-preparation-pre-loading-evidence` — peeled tag object confirmed to resolve to the same commit SHA (not just a matching tag SHA)
- Previous CI run `29999958455` — reported success prior to starting this task
- Working tree at task start: clean, no staged/unstaged changes, in sync with the baseline described above
- No Git write command (`add`/`commit`/`push`/`tag`/`merge`/`rebase`/`reset`/`clean`) was run at any point during this task — confirmed at the end of this task by `git status` and `git rev-parse HEAD` still showing HEAD at the baseline commit with only working-tree modifications/untracked files present

## 2. Implementation Summary

MVP-04 implements formal Delivery Task Assignment: exactly one primary
assignee plus optional non-overlapping supporting employees (informational
only), a mandatory-reason formal reassignment flow, an append-only
assignment history, non-blocking active-workload visibility for dispatch
candidates, and an Internal Delivery Employee's own record-scoped read-only
"My Assigned Tasks" view. The milestone ends the task at status `ASSIGNED`
— no Delivery Start, GPS check-in, evidence capture, recipient/signature,
closure, return, reopen, override, external courier, shared login, or
proxy/temporary execution authority is implemented, per the explicit
out-of-scope boundary in this milestone's brief.

New: `TaskAssignment` (immutable event log), `TaskAssignmentSupport`
(immutable per-assignment support-employee rows), `TaskCurrentAssignment`
(single-row-per-task current pointer, providing both a fast lookup and a
database-level one-current-assignment-per-task backstop via its primary
key). New API module `apps/api/src/assignment` (candidates, assign,
reassign, current, history, my-assigned-tasks list/detail). New Admin Web
assignment/reassignment UI on the task detail page. New Mobile/PWA "My
Assigned Tasks" list/detail pages for `INTERNAL_DELIVERY_EMPLOYEE`.

## 3. Business-Rule Traceability

| Rule | Implementation |
|---|---|
| BR-ASSIGN-001 (one Task, one primary responsible employee at a time) | `TaskCurrentAssignment.taskId` primary key + `SELECT ... FOR UPDATE` row lock in `AssignmentService.assign`/`reassign` |
| BR-ASSIGN-004 (formal reassignment requires mandatory reason) | `ReassignTaskDto.reason: @IsString() @IsNotEmpty() @MaxLength(1000)`, enforced again in `packages/domain` via `validateReassignmentReason`, and by the migration's `task_assignments_type_consistency_check` CHECK constraint (REASSIGNMENT rows must have a non-blank `reason`) |
| BR-ASSIGN-005 (assignment/reassignment history is immutable and auditable) | `TaskAssignment`/`TaskAssignmentSupport` rows are never updated or deleted by application code; every FK referencing them is `ON DELETE RESTRICT`; each assignment/reassignment also writes a `TaskEvent` (`TASK_ASSIGNED`) |
| Workload visibility (non-blocking) | `GET /assignment-candidates` returns `activeTaskCount` per candidate computed from `ACTIVE_ASSIGNMENT_WORKLOAD_STATUSES`; no validator rejects assignment based on this count |
| Stale-write protection | `ReassignTaskDto.expectedCurrentAssignmentId` compared against the locked row's live `currentAssignmentId` inside the same transaction; mismatch aborts with zero writes and `409 { code: "STALE_ASSIGNMENT" }` |

## 4. Approved Assignment Decisions

BDR-ASSIGN-001 through BDR-ASSIGN-005 were supplied to this task already
approved (not open), as follows:

- **BDR-ASSIGN-001** — Supporting/co-traveling employees are recorded on
  the assignment as informational-only entries; they do not get a separate
  account/role/permission grant from this record.
- **BDR-ASSIGN-002** — Supporting employees have no evidence-upload or
  delivery-action authority; only the primary assignee acts on the task.
- **BDR-ASSIGN-003** — Temporary substitute employee access is not solved
  by a new access mechanism in this milestone; the existing (approved)
  formal Reassignment flow is the sanctioned way to hand a task to a
  substitute.
- **BDR-ASSIGN-004** — A primary assignee's active workload is visible at
  assignment time (`activeTaskCount` on each candidate) but never hard-
  blocks assignment.
- **BDR-ASSIGN-005** — Every reassignment (not only exception cases)
  requires a mandatory, non-blank reason, enforced at both the DTO layer
  and the database CHECK constraint.

**Disclosure — Topic 07 (Dispatch Knowledge, business decision register)
was deliberately NOT edited.** The task instruction asked that these BDRs
be "recorded as approved in the authoritative project documents." CLAUDE.md
§19 states Topics 01–10 are never modified by an engineering task. Git
history (`git log --follow` on Topic 07) shows that existing BDR approval
annotations (e.g. BDR-CUSTOMER-001/002, BDR-EVIDENCE-001/002) were added via
separate `docs(dispatch): synchronize/lock approved decisions`-style
commits outside of the corresponding MVP's engineering commit — i.e.
Topic-07 annotation is a distinct Product-Owner/business action, not an
engineering-task action. This task recorded the approval instead in Topic
11 §21 (the roadmap table row for MVP-04, which CLAUDE.md explicitly
permits engineering tasks to synchronize) and here. **No engineering or
technical judgment resolved these BDRs** — they were supplied pre-approved
by the task brief; this section only documents where that approval is
recorded.

To close the loop, here is the exact annotation text, in this repository's
established style (matching the BDR-CUSTOMER-001/002 annotation at Topic 07
line 244), ready for the Product Owner to paste into Topic 07 rows 823–827
(BDR-ASSIGN-001 through 005) as a separate, non-engineering documentation
action:

> **(อนุมัติ 2026-07-23 — BDR-ASSIGN-001 ถึง BDR-ASSIGN-005)** พนักงานที่ร่วม
> ปฏิบัติงาน (Supporting/Co-traveling Employee) บันทึกในรายการมอบหมายเป็น
> ข้อมูลประกอบเท่านั้น ไม่มีบัญชี/สิทธิ์แยกต่างหาก และไม่มีสิทธิ์บันทึกหลักฐาน
> หรือกระทำการส่งมอบใด ๆ (BDR-ASSIGN-001, BDR-ASSIGN-002); สิทธิ์เข้าถึงของ
> พนักงานทดแทนชั่วคราวใช้กลไก Reassignment ที่อนุมัติแล้วแทนการสร้างสิทธิ์ใหม่
> (BDR-ASSIGN-003); ปริมาณงาน Active ของผู้รับผิดชอบหลักแสดงเป็นข้อมูล
> ประกอบการตัดสินใจเท่านั้น ไม่บล็อกการมอบหมาย (BDR-ASSIGN-004); การเปลี่ยน
> ตัวผู้รับผิดชอบ (Reassignment) ทุกกรณีต้องระบุเหตุผลบังคับเสมอ ไม่มีข้อยกเว้น
> (BDR-ASSIGN-005) — BR-ASSIGN-001, BR-ASSIGN-004, BR-ASSIGN-005 (ดู
> `docs/CTO_SUMMARY_MVP_04.md`)

## 5. Open-Decision Boundaries

No open (unapproved) Business Decision Register item was touched or
resolved by this task. Related open items that remain explicitly untouched:

- **BDR-RETURN-007, BDR-RETURN-009** and other Topic 11 §23 items — no
  Returned Goods, Reopen, or Emergency Override code exists; unaffected by
  this milestone.
- Topic 07 row 22 (BDR-ASSIGN-003, "สิทธิ์เข้าถึงของพนักงานทดแทนชั่วคราว")
  already carries a "ไม่ใช่ P0 — ใช้กลไก Reassignment" resolution note in the
  register; this task's implementation is consistent with it and did not
  need to alter or newly resolve that row.
- No route-permission matrix or User/Role-management UI is added — those
  remain listed as unresolved dependencies in `docs/CTO_SUMMARY_AUTH_001.md`
  and are unaffected by this task's scope.

## 6. Status Transition

- Initial assignment: `READY_FOR_DISPATCH → ASSIGNED` (`AssignmentService.assign`)
- Reassignment: `ASSIGNED → ASSIGNED` (status unchanged; only the current
  assignment pointer and history change) (`AssignmentService.reassign`)
- No other status transition is introduced. Attempting to assign a task not
  at `READY_FOR_DISPATCH`, or to reassign a task not at `ASSIGNED`, returns
  `400 Bad Request` with no database writes.

## 7. Concurrency Design

- Every assign/reassign request acquires `SELECT "id" FROM "delivery_tasks"
  WHERE "id" = $1::uuid FOR UPDATE` inside a Prisma `$transaction`, the same
  pessimistic-locking pattern established in `PreparationService`
  (MVP-03), before re-reading task/current-assignment state and validating.
- **Database-level backstop**: `TaskCurrentAssignment.taskId` is a primary
  key, so even if two concurrent transactions both pass application-level
  validation, only one `INSERT`/`UPSERT` on that table can succeed; the
  loser's `Prisma.PrismaClientKnownRequestError` (`code === "P2002"`) is
  caught **outside** the `$transaction` callback (never inside it), so the
  loser's already-executed writes in that same transaction (the
  `TaskAssignment` row, the `TaskEvent` row) are fully rolled back by
  Prisma — zero residue from the losing request. Translated to `409
  Conflict { code: "TASK_ALREADY_ASSIGNED" }`.
- **Stale-write protection for reassignment**: `expectedCurrentAssignmentId`
  is compared against the locked row's live `currentAssignmentId` before
  any write occurs in the transaction; a mismatch returns a `STALE`
  sentinel from the callback (not an exception, so no rollback overhead is
  needed since nothing was written) and the outer code throws `409 {
  code: "STALE_ASSIGNMENT" }`.
- Verified against real PostgreSQL (not mocked) in
  `apps/api/test/assignment.integration-spec.ts`: two duplicate-assignment
  races and a stale-reassignment race, using `pg_stat_activity`-polling
  helpers (`waitForBlockedTaskLocks`/`withHeldTaskLock`) to deterministically
  force lock contention rather than relying on timing, with an assertion of
  zero residual rows from the loser in each case.

## 8. Data Models

- **`TaskAssignment`** — append-only event log. `assignmentType`
  (`INITIAL`/`REASSIGNMENT`), `previousAssignmentId` (self-referential,
  unique, `RESTRICT`, populated only for `REASSIGNMENT`),
  `primaryAssigneeUserId`, `actorUserId`, `note` (optional, initial only),
  `reason` (mandatory, reassignment only), `createdAt`. Enforced via a
  migration-level CHECK constraint
  (`task_assignments_type_consistency_check`): `INITIAL` rows must have a
  null `previousAssignmentId`/`reason`; `REASSIGNMENT` rows must have a
  non-null `previousAssignmentId` and non-blank `reason`.
- **`TaskAssignmentSupport`** — append-only per-assignment supporting-
  employee rows, unique on `(assignmentId, supportUserId)`.
- **`TaskCurrentAssignment`** — single mutable row per task, `taskId` as
  primary key (the concurrency backstop described in §7), pointing at the
  currently-active `TaskAssignment`.
- All foreign keys in this model are `ON DELETE RESTRICT ON UPDATE
  CASCADE`, including the self-referential `previousAssignmentId` FK — no
  `CASCADE` deletes exist anywhere in the assignment schema, consistent
  with the append-only/audit requirement.

## 9. Migration

One new migration:
`apps/api/prisma/migrations/20260723160000_delivery_task_assignment/migration.sql`.
Purely additive: one new enum (`assignment_type`), three new tables, their
indexes, and their foreign keys — no existing table, column, or constraint
is altered or dropped. Verified for clean, idempotent application by
running it inside a scratch schema (`CREATE SCHEMA mvp04_syntax_check`)
wrapped in `BEGIN;`...`ROLLBACK;` against the real Postgres 16 container
before ever applying it to the working dev database. Subsequently applied
for real via `prisma migrate deploy` inside `scripts/db-verify.sh`;
`prisma migrate status` confirms all 7 migrations (this one plus the 6
pre-existing) applied and the schema up to date.

## 10. API

All routes below sit behind the global `JwtAuthenticationGuard` plus
`RolesGuard`/`@Roles(...)`, and set `Cache-Control: no-store`.

| Method & Path | Purpose | Roles |
|---|---|---|
| `GET /assignment-candidates` | Search active users eligible as primary/supporting, with active-workload count | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER` |
| `POST /tasks/:id/assignment` | Initial assignment (`READY_FOR_DISPATCH → ASSIGNED`) | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER` |
| `PUT /tasks/:id/assignment` | Formal reassignment (mandatory reason + stale-write precondition) | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER` |
| `GET /tasks/:id/assignment` | Current assignment for a task | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `STOCK`, `MANAGEMENT_AUDITOR` |
| `GET /tasks/:id/assignment-history` | Full append-only assignment history for a task | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `STOCK`, `MANAGEMENT_AUDITOR` |
| `GET /assigned-tasks` | Caller's own current-primary-assignee task list (record-scoped) | `INTERNAL_DELIVERY_EMPLOYEE` |
| `GET /assigned-tasks/:id` | Caller's own assigned-task detail (record-scoped, `404` if not primary assignee) | `INTERNAL_DELIVERY_EMPLOYEE` |

## 11. Admin Web

`apps/admin-web/src/app/tasks/[id]/_components/assignment-section.tsx`
renders on the task detail page when task status is `READY_FOR_DISPATCH`
(initial assignment form) or `ASSIGNED` (current assignment + reassignment
form), gated by `canAssignTasks(roleCodes)`
(`apps/admin-web/src/app/tasks/_components/roles.ts`,
`SUPER_ADMIN`/`ADMIN`/`DISPATCHER` only). Candidate search, primary/support
selection, workload-count display, current-assignment view, and full
history view are all present. `apps/admin-web/src/lib/tasks-client.ts`
adds an `AssignmentConflictError` with a `code` field so the UI can show a
distinct message and reload on `STALE_ASSIGNMENT` rather than blindly
retrying.

## 12. Mobile/PWA

`apps/mobile-pwa/src/app/assigned-tasks/page.tsx` (list) and
`apps/mobile-pwa/src/app/assigned-tasks/[id]/page.tsx` (detail) are visible
only to `INTERNAL_DELIVERY_EMPLOYEE` principals (linked from the home page
for that role only). Detail view is read-only: address, contact,
instructions, preparation-ready status, and supporting employees labeled
"(informational only)" — no execution controls (no start-delivery, no
evidence, no GPS) are rendered, consistent with the milestone boundary.

## 13. RBAC

All new routes require a valid access token (global guard, unchanged) and
an explicit role check via `RolesGuard`/`@Roles(...)`, resolved from
PostgreSQL per request — never from JWT/client-supplied claims, consistent
with every prior milestone. `INTERNAL_DELIVERY_EMPLOYEE` has no access to
any assignment-write or candidate-search route; dispatch-side roles
(`SUPER_ADMIN`/`ADMIN`/`DISPATCHER`) have no access to `/assigned-tasks*`.
`e2e-spec` asserts 401 (no token) and 403 (wrong role) on every new route.

## 14. Record Scope

`GET /assigned-tasks` and `GET /assigned-tasks/:id` are implemented as a
single scoped query — `taskCurrentAssignment.findFirst({ where: { taskId,
primaryAssigneeUserId: principalUserId }, ... })` — rather than
fetch-then-authorize. A supporting-only or entirely unrelated
`INTERNAL_DELIVERY_EMPLOYEE` receives `404 Not Found`, indistinguishable
from a non-existent task ID; existence of a task they are not the primary
assignee for is never confirmed to them (no `403` is ever returned from
this path). Covered by dedicated e2e cases in
`apps/api/test/assignment.e2e-spec.ts` for both the supporting-only and
unrelated-employee cases, on both the list and detail routes.

## 15. Candidate Workload Policy

`GET /assignment-candidates` returns `{ userId, displayName,
activeTaskCount }` per candidate. `activeTaskCount` is computed via
`taskCurrentAssignment.groupBy` filtered to
`ACTIVE_ASSIGNMENT_WORKLOAD_STATUSES` (`ASSIGNED`, `IN_TRANSIT`,
`AT_DESTINATION`, `WAITING_NEXT_ATTEMPT` — centralized in
`packages/shared-types` and imported everywhere it's used, per
BDR-ASSIGN-004, to avoid scattering status literals). No validator in
`packages/domain` or `AssignmentService` ever rejects an assignment based
on this count — it is visibility only, never a hard block. This is
API-e2e-tested (candidate list reflects an incrementing count as
assignments are made, and a high-workload candidate can still be assigned
successfully). **Coverage note**: the Admin Web *rendering* of the
workload count is exercised only indirectly (the Playwright flow selects a
candidate from the picker, which is populated from this same endpoint) —
there is no dedicated Vitest/Playwright assertion pinned specifically to
the numeric workload display text, consistent with this repository's
existing precedent of not adding standalone component tests for the task
detail page in MVP-02/03 either.

## 16. Assignment History and Audit

Every assign/reassign call writes one immutable `TaskAssignment` row (plus
`TaskAssignmentSupport` rows for supporting employees) and one `TaskEvent`
(`TASK_ASSIGNED`) row, inside the same transaction as the status/pointer
update. No code path updates or deletes a `TaskAssignment` or
`TaskAssignmentSupport` row once written; no `DELETE` route exists for
either. `GET /tasks/:id/assignment-history` returns the full ordered
history for a task, including both `INITIAL` and every subsequent
`REASSIGNMENT` entry with its `reason`.

## 17. Tests

- **Unit**: `packages/shared-types`, `packages/domain`, `packages/contracts`
  — new MVP-04 sections added to each existing `index.test.ts` (workload
  status/assignment type predicates, personnel/status/note/reason/
  stale-precondition validators, DTO/path shape). All passing alongside
  pre-existing suites (16 / 44 / 15 tests respectively, including prior
  milestones).
- **API e2e** (`apps/api/test/assignment.e2e-spec.ts`, real NestJS app +
  Supertest): RBAC 401/403 on every route, initial-assignment validation
  (inactive/wrong-role primary or supporting user, duplicate support,
  primary/support overlap, wrong task status), reassignment validation
  (blank reason, wrong status, stale precondition → 409), record-scope 404
  for supporting-only/unrelated employee on both list and detail,
  candidate workload-count reflection, full history ordering.
- **API integration/concurrency** (`apps/api/test/assignment.
  integration-spec.ts`, real PostgreSQL, no mocks): duplicate-assignment
  race (two concurrent initial assignments on the same task — one wins,
  one gets `409 TASK_ALREADY_ASSIGNED`, zero residue from the loser),
  stale-reassignment race (two concurrent reassignments — one wins, one
  gets `409 STALE_ASSIGNMENT`, zero residue from the loser), using
  `pg_stat_activity`-polling helpers to force deterministic lock
  contention rather than relying on timing.
- **Mobile/PWA unit** (Vitest): `apps/mobile-pwa/src/app/assigned-tasks/
  __tests__/page.test.tsx` (role restriction, empty state, list rendering)
  and `.../[id]/__tests__/page.test.tsx` (404/not-found message, full
  detail rendering with the "(informational only)" supporting-employee
  label and no execution-action assertion).
- **Playwright E2E** (`e2e/tests/assignment.spec.ts`, full stack, real
  browser): logs in as a `DISPATCHER`, assigns a task with one supporting
  employee, verifies the current-assignment and history displays
  (`data-testid="current-assignment"`/`"assignment-history"`, added to
  resolve a strict-mode text-locator ambiguity — see §23), performs a
  reassignment with a reason, verifies history now shows two entries, and
  confirms no start-delivery control is rendered. `e2e/tests/
  task-creation.spec.ts` was updated to reflect that MVP-04's assignment UI
  now legitimately appears at `READY_FOR_DISPATCH` (its prior negative
  assertion predated this milestone).
- **Coverage honesty note**: the Playwright flow above is the *only*
  end-to-end coverage of the Admin Web assignment UI; it covers the
  DISPATCHER assign → reassign happy path plus supporting-employee
  selection and the negative "no start-delivery control" check. It does
  **not** separately exercise: the workload-warning number rendering, the
  stale-conflict UI branch (`AssignmentConflictError` with
  `STALE_ASSIGNMENT` shown to the user), or read-only-role UI behavior
  (e.g. `STOCK`/`MANAGEMENT_AUDITOR` viewing but not being able to submit
  the form) — those paths are covered at the API layer (§17 e2e/integration
  above) and are correct by construction in the UI (the form is gated by
  `canAssignTasks`, and the conflict handler is generic error-message
  rendering shared with the rest of the page), but do not have a dedicated
  browser-level assertion. Mobile/PWA record scope, by contrast, **is**
  fully covered at the API e2e level (§14) — a supporting-only or unrelated
  employee is confirmed to receive 404 on both list and detail.

## 18. Full Verification

All required scripts run, in order, after the final documentation edits —
all exited 0:

```
./scripts/verify.sh            PASS (workspace, lint, typecheck, unit tests,
                                      builds, Prisma generate/validate,
                                      compose config validation,
                                      token-storage scan)
./scripts/docker-verify.sh     PASS (build/start + health checks, all 4 services)
./scripts/db-verify.sh         PASS (migration deploy, idempotent seed,
                                      DB integration tests incl. assignment
                                      concurrency, zero residue)
./scripts/api-smoke-test.sh    PASS (/health, /health/live, /health/ready)
./scripts/mobile-verify.sh     PASS (reachability + manifest; one transient
                                      cold-start failure on first run,
                                      passed cleanly on immediate rerun with
                                      no code change — see §23)
./scripts/security-review.sh   PASS (npm audit, secret scan, Docker safety/config)
./scripts/e2e-local.sh         PASS (Playwright, full stack; flaky under
                                      4 parallel workers due to build-time
                                      resource contention, deterministic
                                      pass at --workers=1 — see §23)
```

Final `docker compose ps` (run for this report): `dispatch-db` and
`dispatch-api` report `(healthy)`; `dispatch-admin-web` and
`dispatch-mobile-pwa` report `Up` — those two have no `healthcheck` defined
in `docker-compose.yml` (only `db` and `api` do), so `Up` is their complete
expected status. All 4 services are running.

## 19. Database Residue

Confirmed zero residue after all test suites: `users` table contains
exactly 1 row (the pre-existing bootstrap operator only — no default user
was seeded), and every MVP-04 table (`task_assignments`,
`task_assignment_supports`, `task_current_assignments`) is at 0 rows, along
with all MVP-02/03 tables, following the full `db-verify.sh` run.

## 20. Files Created

1. `apps/admin-web/src/app/tasks/[id]/_components/assignment-section.tsx`
2. `apps/api/prisma/migrations/20260723160000_delivery_task_assignment/migration.sql`
3. `apps/api/src/assignment/assignment.module.ts`
4. `apps/api/src/assignment/assignment.controller.ts`
5. `apps/api/src/assignment/assignment.service.ts`
6. `apps/api/src/assignment/dto/assignment.dto.ts`
7. `apps/api/test/assignment.e2e-spec.ts`
8. `apps/api/test/assignment.integration-spec.ts`
9. `apps/mobile-pwa/src/app/assigned-tasks/page.tsx`
10. `apps/mobile-pwa/src/app/assigned-tasks/__tests__/page.test.tsx`
11. `apps/mobile-pwa/src/app/assigned-tasks/[id]/page.tsx`
12. `apps/mobile-pwa/src/app/assigned-tasks/[id]/__tests__/page.test.tsx`
13. `apps/mobile-pwa/src/lib/assignment-client.ts`
14. `e2e/scripts/create-assignment-fixture.cjs`
15. `e2e/scripts/delete-assignment-fixture.cjs`
16. `e2e/tests/assignment.spec.ts`
17. `docs/CTO_SUMMARY_MVP_04.md` (this file)

## 21. Files Modified

1. `CLAUDE.md`
2. `Dispatch Knowledge/11 - Technical Architecture และแผนพัฒนา MVP.md`
3. `README.md`
4. `apps/admin-web/src/app/tasks/[id]/page.tsx`
5. `apps/admin-web/src/app/tasks/_components/roles.ts`
6. `apps/admin-web/src/lib/tasks-client.ts`
7. `apps/api/prisma/schema.prisma`
8. `apps/api/src/app.module.ts`
9. `apps/api/src/tasks/tasks.controller.ts`
10. `apps/mobile-pwa/src/app/auth-context.tsx`
11. `apps/mobile-pwa/src/app/page.tsx`
12. `docs/SECURITY_HARNESS.md`
13. `docs/SECURITY_REVIEW_CHECKLIST.md`
14. `docs/SECURITY_REVIEW_LOG.md`
15. `e2e/tests/task-creation.spec.ts`
16. `packages/contracts/src/index.test.ts`
17. `packages/contracts/src/index.ts`
18. `packages/domain/src/index.test.ts`
19. `packages/domain/src/index.ts`
20. `packages/shared-types/src/index.test.ts`
21. `packages/shared-types/src/index.ts`

**Scope note**: 3 of the 21 modified files (`CLAUDE.md`,
`docs/SECURITY_REVIEW_CHECKLIST.md`, and the roadmap row in Topic 11) go
beyond a minimal MVP-04 diff — they bring documentation current from a
frozen AUTH-001-era state (CLAUDE.md's "Current Milestone"/"Current Next
Step" sections had not been updated since commit `489d8e2`, spanning two
prior completed milestones; the security checklist had matching stale
N/A placeholders). This was done deliberately, as accurate engineering-
governance documentation is expected to be kept current, but is flagged
here so the diff isn't a surprise in review.

## 22. Dependency Changes

None. No `package.json` or `package-lock.json` file was modified by this
task (confirmed via `git diff --stat` scoped to those files — no output).

## 23. Issues Found and Fixed

1. **P2002 catch placement** — caught before implementation: placing the
   unique-constraint catch inside the `$transaction` callback would not
   have rolled back already-executed writes in the same transaction. Fixed
   by wrapping the catch around the entire `$transaction(...)` call.
2. **Migration SQL correctness** — verified by applying the hand-written
   SQL inside a scratch Postgres schema wrapped in `BEGIN;`/`ROLLBACK;`
   before ever running it against the real dev database.
3. **`assignment.integration-spec.ts` `afterAll` missing a
   `userRoleAssignment.deleteMany` before `user.deleteMany`** — first
   `db-verify.sh` run failed with a foreign-key violation, leaving 3
   residual test users that then broke `identity-role.integration-spec.ts`'s
   baseline user-count assertion. Fixed by adding the missing
   `deleteMany` call in the correct order. **The 3 residual users were also
   manually deleted via a scoped `psql` transaction** (`DELETE FROM
   user_role_assignments WHERE user_id IN (...); DELETE FROM users WHERE
   display_name LIKE 'mvp04-integration-%';`) to restore the baseline
   before rerunning `db-verify.sh`, which then passed cleanly with zero
   residue. This is disclosed here as a manual, scoped database write made
   outside the normal test harness to clean up this task's own leaked test
   fixtures — it did not touch any pre-existing or unrelated data.
4. **ESLint `react-hooks/set-state-in-effect`** in `assignment-section.tsx`
   — fixed by switching to the established async-IIFE-with-`cancelled`-flag
   effect pattern already used in `tasks/[id]/page.tsx`.
5. **Mobile/PWA "Loading…" stuck indefinitely for non-employee roles** —
   the loading guard never resolved to false for a role that legitimately
   skips the fetch. Fixed by computing an explicit `isDeliveryEmployee`
   flag used consistently in the loading guard, the render check, and to
   skip the fetch entirely for non-employee principals.
6. **Playwright strict-mode locator ambiguity** in `assignment.spec.ts` —
   text locators matched both the candidate picker and the newly-rendered
   history entry. Fixed by adding
   `data-testid="current-assignment"`/`"assignment-history"` to the two
   container `<div>`s and scoping all assertions through
   `page.getByTestId(...)`.
7. **Transient flakiness, not real bugs** — Playwright failures under 4
   parallel workers (resource contention during concurrent Docker builds,
   confirmed by a clean `--workers=1` rerun) and one `mobile-verify.sh`
   cold-start timing failure (passed on immediate rerun with no code
   change). Neither reflects a defect in this task's changes.
8. **Stale documentation discovered and fixed** — `CLAUDE.md` and `docs/
   SECURITY_REVIEW_CHECKLIST.md` had not been updated since AUTH-001,
   despite MVP-02/03 being complete; brought current as part of this task
   (see §21 scope note).

## 24. Remaining Non-Blocking Risks

- No dedicated browser-level test exists for the Admin Web workload-count
  display, the reassignment stale-conflict UI branch, or read-only-role
  view-without-write behavior (see §17 coverage-honesty note) — these are
  covered at the API layer and correct by construction in the UI, but a
  future task could add direct component/E2E coverage.
- `docs/SECURITY_REVIEW_CHECKLIST.md` still lists "API base URL uses HTTPS
  in production" and "Dependabot configured" as deferred — unchanged,
  pre-existing, and out of scope for this milestone.
- Topic 07's BDR-ASSIGN-001–005 rows still show
  `DECIDE_DURING_IMPLEMENTATION` status text in the register itself; the
  ready-to-paste annotation in §4 is provided so a separate,
  non-engineering documentation action can update those rows.
- BDR-ASSIGN-003's underlying operational question (temporary substitute
  employee access) is resolved for this milestone by reusing Reassignment,
  consistent with the register's own existing resolution note — no new
  risk introduced, but any future dedicated "substitute" feature remains a
  distinct future task.

## 25. Exact Git Scope Counts

- Modified tracked files: **21**
- New (untracked) files: **17** (16 implementation/test files + this CTO Summary)
- Staged files: **0**
- `git diff --check`: clean (exit 0, no whitespace errors)
- HEAD: still at baseline `1a37b4c7c29f8b4e2e379b78c2e87484ab7c4a01` on `main`
- No Git write command was run at any point in this task

## 26. Commit Readiness

**READY.** All required verification scripts pass, database residue is
confirmed zero, the Docker stack is healthy and left running, no secrets or
generated artifacts are in scope, and the working tree contains only the
files listed in §20/§21.

## 27. Remote CI

**FAILED — remediation pending rerun.** GitHub Actions run `30060682034`
(triggered by the push of commit `6ea46a6`) reported the `Database
Integration` job **failed**, in
`apps/api/test/identity-role.integration-spec.ts`, test `"re-seeding still
creates no default User (User count still matches baseline)"`:

```
Expected baselineUserCount: 4
Received userCount: 0
```

The `Assignment integration suite` itself (`assignment.integration-spec.ts`)
passed in that same run — the failure is isolated to the identity-role
baseline assertion. This remediation (see §29) has been verified locally
but **has not yet been rerun on remote CI** — that requires the user to push
this follow-up commit. Remote CI must not be reported as passing until that
push and its resulting run are observed.

## 28. Recommended Commit Message

```
feat(dispatch): add delivery task assignment
```

## 29. CI Remediation — Database Integration Test Isolation (follow-up to run 30060682034)

**Confirmed root cause**: `apps/api/test/jest-integration.json` had no
`maxWorkers`/serialization setting, so Jest ran its integration spec files
(`identity-role.integration-spec.ts`, `assignment.integration-spec.ts`,
`auth.integration-spec.ts`, `customer-master.integration-spec.ts`,
`delivery-task.integration-spec.ts`, `health-readiness.integration-spec.ts`)
concurrently, across multiple worker processes, all against the same live,
shared PostgreSQL database (per the repository's intentional single-
integration-database architecture — see `scripts/db-verify.sh`). Several of
those suites (`assignment.integration-spec.ts`, `auth.integration-spec.ts`)
create and later delete their own scoped `User` rows as part of normal test
setup/teardown. `identity-role.integration-spec.ts` captures a
`baselineUserCount` once in its own `beforeAll` and compares against it
twice later in the same file (after re-running the seed script). Because
other suites were running concurrently in separate workers, that baseline
could be captured while another suite's fixture Users transiently existed,
then compared later after that suite's `afterAll` had already deleted them
— an apparent User-count drop that was really a snapshot of another suite's
mid-flight fixture data, not a real seed defect. This reproduces the
observed `4 → 0` mismatch. Confirmed empirically: measuring wall-clock time
of `npm run test:integration` before the fix (56.8s total, while the six
suites' own reported durations summed to ~87s) proves suites were running
overlapped, not sequentially, prior to this change. The exact race window
was not reproduced locally (timing-dependent, 3 local runs against the
unfixed config all happened to pass — local hardware has more headroom than
the CI runner), so this diagnosis rests on the static configuration gap
plus the proven-overlap timing evidence, not on a reproduced local failure.

Confirming precedent already exists in this repository:
`apps/api/test/jest-e2e.json` already sets `"maxWorkers": 1` for exactly
this reason (its e2e spec files share the same live database). Only
`jest-integration.json` was missing the equivalent setting — an omission,
not a deliberate design choice.

**Remediation** (2 files changed, 0 files created):

1. `apps/api/test/jest-integration.json` — added `"maxWorkers": 1`,
   matching the existing `jest-e2e.json` convention. This makes
   serialization an explicit, repository-owned property of the integration
   Jest config itself (effective for local runs, CI, and
   `scripts/db-verify.sh`'s throwaway-container run alike), rather than
   depending on a `--runInBand`/`--maxWorkers` CLI flag that only some
   invocations might remember to pass.
2. `apps/api/test/identity-role.integration-spec.ts` — added a one-block
   comment above `baselineUserCount` documenting that its stability now
   depends on `maxWorkers: 1` in `jest-integration.json`, so a future editor
   does not remove that setting without understanding why it is
   load-bearing. **No assertion, expectation, or test behavior was
   changed** — the existing baseline-comparison design (already reviewed:
   it exists specifically to tolerate a legitimate operator-created
   `SUPER_ADMIN`, per the comment already in that file from
   DEV-FOUNDATION-002) is sound once the concurrency that made it volatile
   is removed. Reviewed per the remediation brief's instruction to check
   whether the assertion itself needed to change; concluded it does not,
   because the volatility was never in the assertion — it was in test-file
   concurrency the assertion had no way to defend against.

**Why this is deterministic**: `maxWorkers: 1` is a hard Jest scheduling
guarantee, not a timing-dependent mitigation — with one worker, Jest
physically cannot start a second integration spec file's test bodies (or
`beforeAll`/`afterAll` hooks) before the previous file's hooks and tests
have fully completed. No two integration spec files' database-mutating code
can therefore ever interleave again, eliminating the shared-baseline race
by construction rather than by making it merely less likely (no sleeps, no
retries, no timing assumptions).

**Scope discipline**: `maxWorkers: 1` was added only to `jest-integration.json`
(matches `.integration-spec.ts$` only). It does not touch
`apps/api/package.json`'s own `jest` block (used for the default `npm test`
unit-test run — `.spec.ts$`, `rootDir: src`), so unit tests remain fully
parallel and unaffected. It also does not touch `jest-e2e.json` (already
correct). Within `assignment.integration-spec.ts`, the intra-test
concurrency primitives (`waitForBlockedTaskLocks`/`withHeldTaskLock`, which
open multiple Prisma connections *within a single test* to force real
Postgres row-lock contention) are unaffected by `maxWorkers` — that setting
only controls concurrency *between* test files, not connections opened by
code inside one test — so the MVP-04 concurrency/race coverage in §7/§17 is
unweakened.

**Verification performed** (all against the real Docker stack —
`dispatch-db`/`dispatch-api` — never a mocked or in-memory database):

- `npm run test:integration --workspace=apps/api`, run 3 consecutive times
  after the fix, via the same throwaway-builder-container mechanism
  `scripts/db-verify.sh` uses (`docker build --target builder` +
  `docker run --rm --network dispatch_default ...`): all 3 runs — 6/6 test
  suites, 47/47 tests passed, no flakiness (22.8s / 21.3s / 20.7s).
- `npm run test:e2e --workspace=apps/api`: 5/5 suites, 39/39 tests passed.
- `./scripts/verify.sh`: PASS (workspace consistency, lint, typecheck, unit
  tests, all builds, Prisma generate/validate, compose config validation,
  token-storage scan).
- `./scripts/docker-verify.sh`: PASS (build/start + health checks, all 4
  services; `dispatch-db`/`dispatch-api` healthy).
- `./scripts/db-verify.sh`: PASS end-to-end, including the real
  `test:integration && test:e2e` run inside the dedicated builder-stage
  container attached to the Docker network (the same non-destructive
  mechanism used for the original MVP-04 sign-off) — migration
  status/deploy, idempotent seed, 6/6 roles, User count unchanged and
  returned to baseline, zero MVP-02/03/04 residue.
- `./scripts/api-smoke-test.sh`: PASS (`/health`, `/health/live`,
  `/health/ready`, `/auth/me` 401, `/auth/login` generic 401).
- `./scripts/mobile-verify.sh`: PASS (reachability, `/login`, manifest,
  no token-storage writes, no service worker).
- `./scripts/security-review.sh`: PASS (dependency audit clear, secret scan
  clear — the one `DATABASE_URL`-mention warning is pre-existing comment
  text across multiple unrelated spec files' doc-comments, unrelated to
  this change, matched before this task as well; Docker safety/config
  checks clear).
- `git diff --check`: clean (exit 0, no whitespace errors).

**Database residue after the full battery** (confirmed via `db-verify.sh`'s
own read-only checks plus direct `psql` inspection): `users` table = 1 row
(the pre-existing bootstrap `SUPER_ADMIN` operator account, with real
sessions/tokens from 2026-07-22/23 predating this task — untouched);
`roles` = exactly 6, matching the approved code set; `auth_sessions` = 3,
`refresh_token_records` = 4 (both matching the pre-existing operator
baseline, returned to that baseline after test cleanup, zero test residue);
all MVP-02 Customer/Task tables and all MVP-04 assignment tables
(`task_assignments`, `task_current_assignments`,
`task_assignment_supports`) = 0 rows.

**Docker health**: all 4 services running; `dispatch-db` and `dispatch-api`
report `(healthy)` (only those two define a healthcheck); `dispatch-admin-web`
and `dispatch-mobile-pwa` report `Up`, their complete expected status. No
Docker teardown command was run at any point.

**Exact change scope**:
- Modified tracked files: **3** (2 remediation files —
  `apps/api/test/jest-integration.json`,
  `apps/api/test/identity-role.integration-spec.ts` — plus this CTO Summary,
  `docs/CTO_SUMMARY_MVP_04.md`)
- New (untracked) files: **0**
- Staged files: **0**
- `git diff --check`: clean
- No Git write command (`add`/`commit`/`push`/`tag`/`merge`/`rebase`/
  `reset`/`clean`) was run at any point in this remediation
- Commit `6ea46a6` was not amended or rewritten — this remediation is
  scoped for a separate follow-up commit only
- BDR-ASSIGN-001 through BDR-ASSIGN-005 (§4) are unchanged
- Topic 07 was not edited

**Commit readiness**: **READY** for a separate follow-up commit (not an
amend of `6ea46a6`).

**Recommended follow-up commit message**:

```
test(dispatch): stabilize database integration isolation
```
