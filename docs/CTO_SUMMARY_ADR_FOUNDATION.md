# CTO Summary — ADR Foundation

## 1. Preflight

- Branch: `main`
- Baseline commit at start: `f8b39b555c88a8628587f49ce08ddf9e173cdb4a`
  ("docs(dispatch): approve MVP-04 assignment decisions")
- Annotated milestone tag `v0.16.0-dispatch-delivery-task-assignment`:
  inspected with `git cat-file -p` — the tag object points directly at
  commit `f8b39b555c88a8628587f49ce08ddf9e173cdb4a`; `git rev-list -n1
  v0.16.0-dispatch-delivery-task-assignment` confirms the peeled commit is
  identical; `git merge-base --is-ancestor v0.16.0-dispatch-delivery-task-assignment
  HEAD` succeeded — the tag is an ancestor of (and in this case identical
  to) `HEAD`.
- `git log --oneline v0.16.0-dispatch-delivery-task-assignment..HEAD`
  returned no commits — HEAD is exactly the tagged commit.
- Working tree at start: clean (`git status` — "nothing to commit, working
  tree clean").
- `git rev-parse main origin/main` returned the identical SHA for both —
  local `main` was synchronized with `origin/main` at start.
- Latest governance GitHub Actions run `30063226655`: verified read-only
  with `gh run view 30063226655 --repo greanlnwfxai/Dispatch` — "main
  Dispatch CI", all four jobs (Security — Audit & Secret Scan, Database
  Integration, Compose — Config Validation, Build/Lint/Typecheck/Test)
  passed. MVP-04 PASS/CLOSED status was taken as given per task briefing
  and is consistent with `docs/CTO_SUMMARY_MVP_04.md` and the tagged
  commit inspected above.

## 2. Objective

Establish the Architecture Decision Record (ADR) foundation for Dispatch:
an ADR policy and template, and seven backfilled ADRs recording why the
technical architecture implemented through MVP-04 was built the way it
was — grounded in actual repository evidence (schema, migrations, service
code, tests), not invented or speculative content. Documentation-only
milestone; no application source, test, migration, Docker, package, or CI
file was touched.

## 3. Documentation Scope

Created `docs/adr/` with a policy document, a reusable template, and seven
ADRs (ADR-0001 through ADR-0007). Made narrow, additive cross-reference
edits to `README.md`, `Dispatch Knowledge/11 - Technical Architecture และ
แผนพัฒนา MVP.md`, and `CLAUDE.md`. No file outside this list was modified.
All prose is Thai with English technical identifiers, code symbols, enum
names, and filenames preserved untranslated throughout (e.g.
`READY_FOR_DISPATCH`, `ASSIGNED`, Prisma, PostgreSQL, RBAC, Record Scope,
Row Lock, Audit Log, TaskEvent, S3-compatible storage).

## 4. ADR Policy

`docs/adr/README.md` defines: the purpose of ADR vs. BDR (Topic 07) vs. TDR
(Topic 11 §22) vs. CTO Summary vs. future Runbooks; the four allowed status
values (Proposed / Accepted / Deprecated / Superseded); the Backfilled ADR
convention (`Record Type: Backfilled ADR`, `Date Recorded: 2026-07-24`,
`Effective Since: <milestone>`); ADR immutability (Accepted ADRs are only
corrected for typos/formatting/links — a material change requires a new
ADR that supersedes the old one, and the old one is only edited to flip
`Status` to `Superseded` and set `Superseded By`); when an ADR is required
vs. not required; the approval boundary (engineering drafts ADRs under
already-approved architecture; ADRs never approve or reinterpret a
business decision; open BDRs/TDRs stay open); and the ADR index table.

## 5. ADR Template

`docs/adr/ADR-TEMPLATE.md` provides the required section structure (Status,
Record Type, Date Recorded, Effective Since, Decision Owners, Related
BDRs/TDRs/Milestones, Supersedes/Superseded By, Context, Decision Drivers,
Considered Options with at least two options, Decision, Consequences split
into Positive/Negative/Operational/Security-Privacy/Testing, Implementation
Constraints, Repository Evidence, Open Follow-ups, Review Triggers,
References) with brief HTML-comment guidance per section, role-based
decision owners (Product Owner / Architecture / Engineering / Security-
Privacy Review — no personal names), and no speculative required fields.

## 6. ADR-0001 Summary

**Application Architecture and Workspace Boundaries** — records the
npm-workspaces monorepo (9 workspaces), the dependency direction that keeps
`packages/domain` framework-independent (verified empty of NestJS/Next.js/
Prisma/React imports and dependencies), `packages/contracts`/
`packages/shared-types` as the single source of shared DTOs/enums, and that
`apps/admin-web`/`apps/mobile-pwa` depend only on `@dispatch/contracts` and
`@dispatch/shared-types` (never `@dispatch/domain`) — confirmed against
each workspace's `package.json` and a sample API-client file
(`apps/admin-web/src/lib/tasks-client.ts`). Negative consequences recorded
honestly: no TypeScript project-reference or lint-level enforcement of the
dependency direction (relies on `package.json` declarations and review),
and no path-based CI trigger per workspace.

## 7. ADR-0002 Summary

**PostgreSQL, Prisma, and Forward-Only Migrations** — records PostgreSQL 16
+ Prisma with additive, forward-only migrations: applied migrations are
never edited; corrections are new migration files (evidenced by
`20260723093000_task_event_delete_restrict` and
`20260723152000_fix_preparation_evidence_object_key_check`, both read in
full). Records that database constraints (CHECK, partial unique index,
restrictive FK) are a backstop independent of application validation, that
`scripts/db-verify.sh` never drops/resets/truncates (it carries its own
`FORBIDDEN_PATTERN` self-guard), and that PostgreSQL has no host port
mapping. Negative consequences: migration file count grows even for small
fixes, and forward-only discipline is convention-enforced, not
tooling-enforced.

## 8. ADR-0003 Summary

**Delivery Task State Machine** — records the 10-value `DeliveryTaskStatus`
enum (matching Topic 04) with only the first five transitions
(`DRAFT -> WAITING_PREPARATION -> PREPARING -> READY_FOR_DISPATCH ->
ASSIGNED`) actually implemented through MVP-04, each behind a dedicated
service method that re-reads status under a row lock before transitioning.
Explicitly flags that the remaining five enum values have no implemented
transition path yet, to prevent a reader from mistaking schema completeness
for feature completeness. Does not describe any MVP-05+ transition as
implemented.

## 9. ADR-0004 Summary

**Task Row Locking and Concurrency Control** — records the actual
implementation: pessimistic `SELECT ... FOR UPDATE` on `delivery_tasks`
inside a Prisma interactive transaction, the `task_current_assignments`
primary-key-on-`taskId` database backstop (Prisma `P2002` translated to
HTTP 409 `TASK_ALREADY_ASSIGNED`), and an explicit
`expectedCurrentAssignmentId` stale-write precondition on reassignment
(HTTP 409 `STALE_ASSIGNMENT`) checked under the same lock. Per advisor
review during drafting, this ADR deliberately does **not** copy Topic 11
§8.3's "optimistic locking on a DeliveryTask version" language — no version
column exists in the schema; what is built is pessimistic locking
complemented by an explicit-id precondition, and the ADR states that
distinction directly. Evidence includes the two concurrency-specific
`Promise.all` test cases in `apps/api/test/assignment.integration-spec.ts`
run against a real PostgreSQL database, with no sleep/retry-loop
correctness mechanism.

## 10. ADR-0005 Summary

**Immutable Operational History and Audit Trail** — records `TaskEvent`
(status history), `TaskAssignment`/`TaskAssignmentSupport` (append-only
assignment history) versus `TaskCurrentAssignment` (the one intentionally
mutable pointer), and `PreparationCorrectionRecord` (dual before/after JSON
snapshot instead of overwriting). Confirms no `@Delete()` route exists for
any of these tables. States plainly that "immutable" here means
application/relational-layer preservation (no UPDATE/DELETE endpoint,
`ON DELETE RESTRICT`) — not cryptographic or WORM guarantees — per advisor
guidance to avoid overclaiming.

## 11. ADR-0006 Summary

**RBAC and Server-Side Record Scope** — records the two-layer server-side
authorization: `JwtAuthenticationGuard` (global via `APP_GUARD`) resolving
role codes from PostgreSQL on every request (never from JWT claims), and
`RolesGuard` + `@Roles(...)` per route. Records the record-scope 404
pattern in `AssignmentService.getMyAssignedTaskDetail` — a supporting-only
or unrelated employee receives the identical 404 a nonexistent task would,
enforced in the query itself rather than fetch-then-check. Confirms
`@Public()` is used only on health endpoints and pre-authentication auth
routes, and that candidate/response DTOs return only the fields the UI
needs (no credentials/tokens/sessions).

## 12. ADR-0007 Summary

**Private Evidence Storage Abstraction** — records the storage-interface
abstraction (`EvidenceStorageService`), the filesystem-backed development
adapter on the `dispatch_evidence_data` Docker named volume (API-only
mount, no host port), opaque server-generated object keys, MIME +
magic-byte validation, the 5 MB / JPEG-PNG-WebP limit, server-side SHA-256,
authenticated retrieval with `Cache-Control: private, no-store`, and the
exact-object-only compensating delete on a failed metadata transaction.
Deliberately does **not** approve a production storage vendor: TDR-STORAGE-001's
status string (`IMPLEMENTED_FOR_MVP_03_DEV_ADAPTER`) is quoted and left
exactly as recorded in Topic 11 §22, with an Open Follow-ups entry stating
provider selection remains open.

## 13. BDR / ADR / TDR Boundaries

`docs/adr/README.md` §1 and the new Topic 11 §26 cross-reference both state
the same boundary table (BDR = business decisions, Product Owner/User
authority only; TDR = still-open technical options, Topic 11 §22; ADR =
why the approved architecture was built this way, Architecture/Engineering
authority under already-approved scope; CTO Summary = delivery record, not
an approval record). No ADR in this set approves, modifies, or
reinterprets a BDR or flips an open TDR to approved.

## 13a. Research Delegation Note

Five `Explore` (read-only, no Edit/Write tool access) subagents were
launched in parallel early in this task to accelerate evidence-gathering
for ADR-0001, ADR-0006, and ADR-0007 (workspace boundaries, DB/Prisma
detail, state-machine/concurrency, audit/RBAC, and evidence storage). Their
findings were treated as leads only, per the working rule that an agent's
report describes what it intended to check, not verified fact. Every path,
symbol, and migration actually cited in every ADR's Repository Evidence
section was independently re-opened and read directly by this task (see
§15) before being cited — the agents' background reports were superseded
by that direct inspection and were not required to reach the conclusions
in this Summary. Being read-only Explore agents, they could not have
touched git scope regardless of completion timing, so no result from them
was awaited before finalizing.

## 14. Cross-Reference Updates

- `README.md` — added a short "Architecture Decision Records" section
  linking to `docs/adr/README.md`, placed immediately before "Manual Git
  workflow". No existing content rewritten.
- `Dispatch Knowledge/11 - Technical Architecture และแผนพัฒนา MVP.md` —
  added new `## 26. Architecture Decision Records (ADR) Cross-Reference`
  section immediately before `## Related Documents`, explicitly marked as
  added 2026-07-24 and non-destructive to prior content (hidden in a
  `[!note]` callout). Lists ADR-0001 through ADR-0007 by title only (no
  full content duplicated), restates the BDR/TDR/ADR/CTO-Summary boundary
  table, and explicitly states that BDR-RETURN-007, BDR-RETURN-009,
  TDR-STORAGE-001 (production provider), TDR-JOBS-001, and TDR-DEPLOY-001
  (production) remain open exactly as recorded in §22/§23. No existing
  section (1–25) was edited.
- `CLAUDE.md` — added new `## 21. Architecture Decision Record (ADR)
  Governance` section at the end of the file: inspect accepted ADRs before
  architecture-changing work; create a new ADR for material architecture
  decisions; supersede rather than rewrite an Accepted ADR; never use an
  ADR to approve/reinterpret a business rule; documentation-only ADR work
  still follows the manual Git policy in §9. No existing section (1–20)
  was reorganized or rewritten.

`git diff --numstat` on all three modified files confirms this
independently: `CLAUDE.md` +18/-0, `Dispatch Knowledge/11 - Technical
Architecture และแผนพัฒนา MVP.md` +43/-0, `README.md` +11/-0 — every edit is
purely additive (zero deletions, zero lines changed in place). No existing
line in any of the three files was modified or removed.

## 15. Repository Evidence Review

Every path cited in every ADR's Repository Evidence section was opened and
read directly by this task (not taken solely from delegated research) —
`apps/api/prisma/schema.prisma`, all relevant migration `.sql` files under
`apps/api/prisma/migrations/`, `apps/api/src/assignment/assignment.service.ts`,
`apps/api/src/preparation/preparation.service.ts`,
`apps/api/src/preparation/storage/evidence-storage.service.ts`,
`apps/api/src/auth/guards/roles.guard.ts`,
`apps/api/src/auth/guards/jwt-authentication.guard.ts`,
`apps/api/src/auth/auth.module.ts`, `apps/api/test/assignment.integration-spec.ts`,
relevant `package.json` files across `packages/*` and `apps/*`,
`tsconfig.base.json`, `docker-compose.yml`, `scripts/db-verify.sh`,
`README.md`, and Dispatch Knowledge Topic 07 and Topic 11 in full. Evidence
is cited by file path + symbol/migration name, not by line number, per the
task's stability requirement.

## 16. Open Decisions Preserved

Confirmed still open and untouched by this task: BDR-RETURN-007,
BDR-RETURN-009 (Topic 07, unchanged — Topic 07 was not edited by this
task), TDR-STORAGE-001 production-provider selection, TDR-JOBS-001, and
TDR-DEPLOY-001 production platform/topology (Topic 11 §22, status strings
left byte-identical to what this task found). BDR-ASSIGN-001 through
BDR-ASSIGN-005 are correctly referenced as `APPROVED` (2026-07-23, per
Topic 07 §15.3) — this task did not newly approve them, only cited the
existing approval.

## 17. Documentation Verification

- Every expected file exists: `docs/adr/README.md`,
  `docs/adr/ADR-TEMPLATE.md`, `docs/adr/ADR-0001-...md` through
  `docs/adr/ADR-0007-...md`, `docs/CTO_SUMMARY_ADR_FOUNDATION.md` (9 + 1 =
  10 files) — verified with `find docs/adr -type f`.
- ADR IDs and filenames match 1:1; no duplicate ADR IDs.
- Every ADR index entry in `docs/adr/README.md` §8 has a corresponding
  file, and every file has an index entry.
- Every ADR contains all required template sections and metadata fields;
  all seven declare `Record Type: Backfilled ADR` and `Date Recorded:
  2026-07-24`.
- Status values used are limited to the four declared values (all seven
  ADRs are `Accepted`).
- Internal relative markdown links (README ↔ ADRs, ADRs ↔ each other,
  README.md/Topic 11 ↔ `docs/adr/README.md`) were checked with a
  throwaway verification script run from the scratchpad directory (not
  committed) that resolves every `[text](relative/path.md)` link against
  the filesystem — no existing link-checking dependency was found in
  `package.json`, and none was added.
- `git diff --check` — clean (no whitespace errors).
- `git status --short` — only the four expected paths appear (three
  modified files, one new `docs/adr/` directory); `docs/CTO_SUMMARY_ADR_FOUNDATION.md`
  itself appears as untracked once created.
- No source, test, migration, Docker, package, lockfile, or environment
  file appears in `git status --short` output.

## 18. Files Created

- `docs/adr/README.md`
- `docs/adr/ADR-TEMPLATE.md`
- `docs/adr/ADR-0001-application-architecture-and-workspace-boundaries.md`
- `docs/adr/ADR-0002-postgresql-prisma-and-forward-only-migrations.md`
- `docs/adr/ADR-0003-delivery-task-state-machine.md`
- `docs/adr/ADR-0004-task-row-locking-and-concurrency-control.md`
- `docs/adr/ADR-0005-immutable-operational-history-and-audit-trail.md`
- `docs/adr/ADR-0006-rbac-and-server-side-record-scope.md`
- `docs/adr/ADR-0007-private-evidence-storage-abstraction.md`
- `docs/CTO_SUMMARY_ADR_FOUNDATION.md`

## 19. Files Modified

- `README.md`
- `Dispatch Knowledge/11 - Technical Architecture และแผนพัฒนา MVP.md`
- `CLAUDE.md`

## 20. Issues Found and Fixed

None blocking. Two accuracy corrections were made:

1. **During drafting** — ADR-0004 was written to describe the actual
   implemented concurrency mechanism (pessimistic row lock + explicit-id
   stale-write precondition) rather than Topic 11 §8.3's original
   conceptual "optimistic locking on a DeliveryTask version" proposal,
   since no version column exists in `apps/api/prisma/schema.prisma` —
   flagged explicitly inside ADR-0004's Repository Evidence section.
2. **During consolidated self-review** — ADR-0004's Testing Consequences
   and Implementation Constraints originally claimed the concurrency test
   suite uses "no sleep/retry loop as a correctness mechanism." Re-reading
   `apps/api/test/assignment.integration-spec.ts` in full during self-review
   found a `delay(25)` helper used inside `waitForBlockedTaskLocks`, a
   bounded (5s deadline) poll loop against `pg_stat_activity` that waits
   for the row lock to actually be contended before proceeding. This is a
   legitimate technique (polling an authoritative database signal, not
   guessing a fixed wait time) but the ADR's original wording was
   inaccurate as written. Corrected in place to describe the real pattern
   precisely instead of overclaiming "no sleep of any kind."

## 21. Remaining Non-Blocking Risks

- The ADR set documents architecture only through MVP-04. MVP-05 onward
  (Delivery Attempt, GPS check-in, Returns, Reopen, Override) will need new
  ADRs or amendments once implemented — none of that is speculated here.
- No tooling enforces the dependency-direction and forward-only-migration
  conventions this ADR set documents; both currently rely on code review
  discipline (recorded honestly as a Negative consequence in ADR-0001 and
  ADR-0002 rather than hidden).
- The link-verification script used for this task was a throwaway script
  outside the repository (per task instruction §18) and is not part of the
  permanent verification suite — future ADR additions should be spot-checked
  for broken relative links manually or with an equivalent one-off check.

## 22. Exact Git Scope Counts

- Staged files: 0 (`git diff --cached --stat` empty)
- Modified files (unstaged): 3 — `CLAUDE.md`, `Dispatch Knowledge/11 -
  Technical Architecture และแผนพัฒนา MVP.md`, `README.md`
- Untracked files/directories: `docs/adr/` (9 files) and
  `docs/CTO_SUMMARY_ADR_FOUNDATION.md` (1 file) — 10 new files total
- No source (`apps/*/src`), test (`*.spec.ts`, `*.integration-spec.ts`,
  `e2e/`), migration (`apps/api/prisma/migrations/`), Docker
  (`docker-compose.yml`, `Dockerfile`), package (`package.json`), lockfile
  (`package-lock.json`), or environment (`.env*`) file appears anywhere in
  `git status --short`.
- No `git add`, `git commit`, `git push`, `git tag`, `git merge`, or any
  history-rewriting/remote-changing Git command was run at any point in
  this task — all Git usage was read-only inspection (`status`, `diff`,
  `log`, `tag`/`cat-file`, `rev-list`, `merge-base`, `rev-parse`, `remote
  -v`, `fetch --dry-run`).

## 23. Commit Readiness

**READY** — documentation-only change set, all seven ADRs plus policy/
template/index/cross-references/CTO Summary complete, verification and
consolidated self-review passed, zero staged files, no non-documentation
file touched.

## 24. Remote CI

NOT YET RUN

## 25. Recommended Commit Message

```
docs(dispatch): establish architecture decision records
```
