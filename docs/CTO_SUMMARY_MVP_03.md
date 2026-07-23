# CTO Summary
## Task
MVP-03 — Preparation and Pre-loading Evidence

## Status
**PASS — local only. Remote GitHub Actions: NOT YET RUN.**

## Objective
Implemented the operational preparation workflow through
`READY_FOR_DISPATCH`: start preparation, snapshot planned goods, update
prepared quantities/notes, record/resolve preparation issues, upload private
pre-loading photo evidence, confirm ready, and expose the data in Admin Web.
Also implemented the governance foundation for post-`IN_TRANSIT` stock
discrepancy reports, Admin-created Preparation Correction/Exception Records,
and mandatory Super Admin retrospective review without changing Main Task
Status.

## Baseline and Preflight

| Check | Result |
|---|---|
| Branch / HEAD | `main` at `e2542b24ccf33665678af570b84a0eff8873b9cd` |
| Tag at HEAD | `v0.14.0-dispatch-customer-task-creation` |
| Working tree before edits | Clean |
| API readiness | `GET /health` returned `status=ok`, `database=ok` |
| PostgreSQL exposure | Internal Docker network only; no host port binding |
| Roles | Exactly `ADMIN`, `DISPATCHER`, `INTERNAL_DELIVERY_EMPLOYEE`, `MANAGEMENT_AUDITOR`, `STOCK`, `SUPER_ADMIN` |
| Operator/auth baseline | `users=1`, `user_role_assignments=1`, `auth_sessions=1`, `refresh_token_records=1`; preserved |

Committed migrations before the milestone were exactly the four expected
MVP-02/auth migrations. MVP-03 added two new migrations listed below.

## Business-Rule Traceability

| Rule / decision | Implementation |
|---|---|
| BR-PREP-001 through BR-PREP-008 | `PreparationService` implements start, update, issue, evidence, and ready confirmation with state guards and TaskEvent history. |
| BR-EVIDENCE-001 / BR-EVIDENCE-002 | Pre-loading photo evidence is mandatory before ready, uploaded as multipart bytes, stored privately, and served only through authenticated API retrieval. |
| VR-PREP-001a / 002a / 003a | Pure domain validators in `packages/domain` enforce start/update/ready gates and are called before writes inside locked transactions. |
| BR-DATA-007 | No Task delete endpoint; preparation/evidence/correction history uses restrictive FK behavior. |
| BR-AUDIT-001 / 003 | Every transition/governance action appends TaskEvent history; evidence and corrections are append-only. |
| BDR-PREP-001 Option C | Evidence is linked to `PreparationRecord` in this milestone because Assignment/DeliveryAttempt is excluded. Future attempts can reference the frozen preparation/evidence set. |
| BDR-PREP-004 Option A | Admin creates Correction/Exception Records immediately with `PENDING_REVIEW`; Super Admin reviews retrospectively. |

## Open Decision Boundaries

`BDR-PREP-002`, `BDR-PREP-003`, evidence content/quality policy, exact
long-term retention policy, and Assignment/DeliveryAttempt linkage policy
remain open. The implementation does not invent a planned-vs-prepared
equality rule, retry policy, reopen path, hold status, emergency override,
or attempt creation.

## Architecture

- API module: `apps/api/src/preparation/*`.
- Domain validation: `packages/domain/src/index.ts`.
- Shared enums/contracts: `packages/shared-types` and `packages/contracts`.
- Admin Web: Task detail preparation section plus
  `/preparation-corrections` review queue.
- Storage: filesystem-backed development adapter on a Docker named volume,
  behind the same storage interface expected to be replaced by
  S3-compatible storage.

## State Transitions and Concurrency

New Main Task Status transitions are only:

- `WAITING_PREPARATION -> PREPARING`
- `PREPARING -> READY_FOR_DISPATCH`

Every state-changing preparation command uses a Prisma interactive
transaction, acquires `SELECT ... FOR UPDATE` on the `delivery_tasks` row
before state-dependent validation, re-reads fresh state after locking, and
writes the status update plus exactly one `TaskEvent` atomically.
Duplicate start/ready actions are rejected by fresh status checks and the
one-to-one `PreparationRecord.taskId` constraint.

Evidence consistency uses object-first write followed by transactional
metadata creation. If metadata creation fails, the service deletes only the
exact newly written object key. Successful metadata records are immutable and
point to a checksum-verified object.

## Data Models

Added:

- `PreparationRecord`
- `PreparationItem`
- `PreparationIssue`
- `PreparationEvidence`
- `PreparationDiscrepancyReport`
- `PreparationCorrectionRecord`

Core relational fields are first-class columns. JSONB is limited to immutable
original/corrected correction snapshots. FK delete behavior is restrictive
for audit/evidence/governance traceability.

## Migrations

Added migrations:

1. `apps/api/prisma/migrations/20260723143000_preparation_and_pre_loading_evidence/migration.sql`
2. `apps/api/prisma/migrations/20260723152000_fix_preparation_evidence_object_key_check/migration.sql`

The first migration is additive: enums, six tables, indexes, FKs, and CHECK
constraints. The second migration drops and recreates only the
`preparation_evidence_object_key_check` CHECK constraint after verification
found the original regex was too strict for valid generated keys. No table,
column, row, enum value, or data was deleted.

Applied checksums:

- `20260722070103_identity_role_foundation` — `39b60dc5b5d7f44cf35105bd68c32f0abc7354f71769a07799e67df25bed639e`
- `20260722105124_authentication_session_foundation` — `5ee039fbda73459b99e7673a12df8882116c7cf2b3565a52f6c21e6919349cc9`
- `20260722135828_customer_and_task_creation` — `76676e24881bb176aca058164760e6586a813cbc62150bcc2d21dbd0b87b3b98`
- `20260723093000_task_event_delete_restrict` — `6adc7fd9cae0ed31912b8785d1a9f780abb2a1a1a0844b7e53633fc290dc7fde`
- `20260723143000_preparation_and_pre_loading_evidence` — `db75d6c13d952790f4e6588090e6f94433cd75cca78d0abba60c27d335a0ae68`
- `20260723152000_fix_preparation_evidence_object_key_check` — `0fb5267af792f659b90a6477f6bee1811226e784bd87ef95c793228c57e5d26b`

`prisma migrate status` reports six migrations and database schema up to
date.

## Evidence-Storage Technical Decision

TDR-STORAGE-001 is resolved for MVP-03 as a technical implementation
decision, not a business approval: use a filesystem-backed development
adapter mounted at `/var/lib/dispatch/evidence` on a persistent Docker named
volume. This avoids committing credentials or modifying the operator's real
`.env` to add MinIO secrets. Production target remains S3-compatible private
object storage behind the same application boundary.

The development adapter:

- generates opaque keys under `preparation/{preparationId}/{uuid}.{ext}`;
- rejects traversal via regex plus resolved-path containment checks;
- writes with exclusive create mode;
- exposes no public bucket, public URL, signed URL, or host port;
- deletes only the exact temporary object it created when metadata creation
  fails.

## Evidence Security

Uploads are multipart/form-data only. Accepted types are JPEG, PNG, and WebP
with MIME header and magic-byte verification, 5 MB file limit, one file, and
bounded multipart parts. SHA-256 is calculated server-side over the original
bytes. Retrieval is authenticated and authorized for every request and sends
`Cache-Control: private, no-store`; filenames are metadata only and sanitized
for response headers. Object keys and filesystem paths are not returned to
clients.

## API

Added:

- `POST /tasks/:id/preparation/start`
- `GET /tasks/:id/preparation`
- `PATCH /tasks/:id/preparation`
- `POST /tasks/:id/preparation/issues`
- `PATCH /tasks/:id/preparation/issues/:issueId/resolve`
- `POST /tasks/:id/preparation/evidence`
- `GET /tasks/:id/preparation/evidence/:evidenceId`
- `POST /tasks/:id/preparation/confirm-ready`
- `POST /tasks/:id/preparation/discrepancy-reports`
- `POST /tasks/:id/preparation/corrections`
- `GET /preparation-corrections`
- `POST /preparation-corrections/:id/review`

No delete endpoints were added for Task, Preparation, Evidence, Issue,
Discrepancy, Correction, or Review history.

## RBAC

| Capability | Roles |
|---|---|
| Read preparation | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `STOCK`, `MANAGEMENT_AUDITOR` |
| Start/update/issues/evidence/ready | `STOCK`, `ADMIN`, `SUPER_ADMIN` |
| Post-transit stock discrepancy report | `STOCK` |
| Create Preparation Correction/Exception | `ADMIN` |
| Review Preparation Correction | `SUPER_ADMIN` |
| Read correction queue/history | `SUPER_ADMIN`, `ADMIN`, `MANAGEMENT_AUDITOR` |
| Internal Delivery Employee | Denied; assignment scope is not implemented |

Authorization continues to resolve role codes from PostgreSQL per request;
JWT role claims are not trusted as the source of authorization.

## Admin Web

Task detail now shows preparation status, evidence presence, unresolved issue
count, prepared goods, notes, issue create/resolve controls, pre-loading
photo upload/preview/open, ready confirmation, and correction records. Actions
are hidden for read-only roles and still enforced by the API. Evidence
previews use in-memory `File`/Blob URLs only and revoke object URLs; no
localStorage/sessionStorage/IndexedDB persistence is used.

Added `/preparation-corrections` as the review queue. It allows Super Admin
review notes and exposes no Main Task Status, Reopen, Assignment, or
Emergency Override action.

## Correction Governance

Stock discrepancy reports are accepted only for `IN_TRANSIT` or later
approved lifecycle statuses. Admin-created Correction/Exception Records store
the original preparation snapshot separately from corrected/exception data
and immediately enter `PENDING_REVIEW`; Main Task Status is unchanged.
Super Admin review requires a note and changes only
`PENDING_REVIEW -> REVIEWED`; same-person creator/reviewer behavior is
blocked in the service.

## Verification Results

- `npm run prisma:generate --workspace=apps/api` — PASS
- `npm run prisma:validate --workspace=apps/api` — PASS
- Migration SQL inspection — PASS; additive plus one CHECK replacement
- Targeted package/domain/contracts/shared tests — PASS
- Targeted API e2e preparation suite — PASS (`3` tests)
- Admin Web lint/typecheck/tests — PASS
- `./scripts/verify.sh` — PASS
- `./scripts/docker-verify.sh` — PASS
- `./scripts/db-verify.sh` — PASS after increasing e2e Jest timeout/worker determinism
- `./scripts/api-smoke-test.sh` — PASS
- `./scripts/mobile-verify.sh` — PASS
- `./scripts/security-review.sh` — PASS automated checks; literal `DATABASE_URL` comment/test warning manually reviewed
- `./scripts/e2e-local.sh` — PASS (`5` Playwright tests, including MVP-03 preparation flow)

## Database Before/After Counts

Preflight and final counts are unchanged except for the new empty MVP-03
tables. Final counts:

| Table | Count |
|---|---:|
| `users` | 1 |
| `roles` | 6 |
| `user_role_assignments` | 1 |
| `auth_sessions` | 1 |
| `refresh_token_records` | 1 |
| `customers` | 0 |
| `customer_destinations` | 0 |
| `customer_master_searches` | 0 |
| `delivery_tasks` | 0 |
| `delivery_task_items` | 0 |
| `task_references` | 0 |
| `task_events` | 0 |
| `preparation_records` | 0 |
| `preparation_items` | 0 |
| `preparation_issues` | 0 |
| `preparation_evidence` | 0 |
| `preparation_discrepancy_reports` | 0 |
| `preparation_correction_records` | 0 |

Object-storage residue: `0` files under `/var/lib/dispatch/evidence`.

## Issues Found and Fixed

- Fixed unsafe JavaScript decimal max literal in domain validation by relying
  on the exact Decimal(18,3) regex.
- Fixed evidence object-key CHECK constraint regex with a new additive
  migration after the original migration rejected valid generated keys.
- Fixed Jest e2e harness timeout by setting 30s timeout and one worker.
- Fixed Admin Web start-preparation state so inputs become enabled
  immediately after `WAITING_PREPARATION -> PREPARING`.
- Updated Playwright from MVP-02-only assertions to the MVP-03 preparation
  flow.

## Remaining Risks

- TDR-STORAGE-001 production adapter remains future work; MVP-03 uses the
  documented filesystem-backed development adapter.
- BDR-PREP-002/003 remain open; no equality or retry-cycle policy is
  implemented.
- Notification delivery for MATERIAL correction urgency is not implemented;
  urgency is represented by materiality/review queue ordering only.

## Files Created

Regenerated from Git scope during final review:

- `apps/admin-web/src/app/preparation-corrections/page.tsx`
- `apps/api/prisma/migrations/20260723143000_preparation_and_pre_loading_evidence/migration.sql`
- `apps/api/prisma/migrations/20260723152000_fix_preparation_evidence_object_key_check/migration.sql`
- `apps/api/src/preparation/dto/preparation.dto.ts`
- `apps/api/src/preparation/preparation.controller.ts`
- `apps/api/src/preparation/preparation.module.ts`
- `apps/api/src/preparation/preparation.service.ts`
- `apps/api/src/preparation/storage/evidence-storage.service.ts`
- `apps/api/test/preparation.e2e-spec.ts`
- `docs/CTO_SUMMARY_MVP_03.md`

## Files Modified

Regenerated from Git scope during final review:

- `README.md`
- `Dispatch Knowledge/11 - Technical Architecture และแผนพัฒนา MVP.md`
- `apps/admin-web/src/app/tasks/[id]/page.tsx`
- `apps/admin-web/src/app/tasks/_components/roles.ts`
- `apps/admin-web/src/lib/tasks-client.ts`
- `apps/api/Dockerfile`
- `apps/api/prisma/schema.prisma`
- `apps/api/src/app.module.ts`
- `apps/api/test/jest-e2e.json`
- `docker-compose.yml`
- `docs/SECURITY_HARNESS.md`
- `docs/SECURITY_REVIEW_LOG.md`
- `e2e/scripts/create-task-fixture.cjs`
- `e2e/scripts/delete-task-fixture.cjs`
- `e2e/tests/task-creation.spec.ts`
- `packages/contracts/src/index.test.ts`
- `packages/contracts/src/index.ts`
- `packages/domain/src/index.test.ts`
- `packages/domain/src/index.ts`
- `packages/shared-types/src/index.test.ts`
- `packages/shared-types/src/index.ts`

## Repository Hygiene

`git diff --check` passes. Staged files: `0`. No `.env`, secret file,
generated build output, or evidence file is tracked. Docker stack remains
running.

## Remote CI

NOT YET RUN.

## Recommended Commit Message

`feat(dispatch): add preparation and pre-loading evidence`
