# Dispatch

Central delivery-task tracking and control system for STEP-SOLUTIONS —
covering task creation, stock preparation, assignment, internal delivery
(GPS check-in, evidence, recipient capture), external courier recording,
returned goods, reopen, emergency override, and audit/reporting.

**Current milestone: MVP-04 — Delivery Task Assignment.** Prior milestone
AUTH-001 (Authentication and RBAC Foundation) is complete: login/refresh/
logout with short-lived JWT access tokens, rotating opaque refresh tokens,
server-side session/revocation storage, and RBAC guards. MVP-02 added the
first Dispatch business capability: read-only Customer/Destination Master
search (search-first, BDR-CUSTOMER-001/002), and Delivery Task creation/
editing/submission (DRAFT → WAITING_PREPARATION) with an immutable
Historical Destination Snapshot. MVP-03 added Stock/Admin preparation
through `READY_FOR_DISPATCH`, private pre-loading photo evidence,
preparation issues, and the correction-governance foundation. MVP-04 adds
formal Assignment (`READY_FOR_DISPATCH` → `ASSIGNED`): exactly one primary
internal delivery employee plus optional informational-only supporting
employees, formal reassignment with a mandatory reason and stale-write
protection, non-blocking active-workload visibility on candidate search, and
the Internal Delivery Employee's own record-scoped "My assigned tasks"
read-only view (BDR-ASSIGN-001 through BDR-ASSIGN-005).
**No start-delivery, DeliveryAttempt, GPS check-in, handover evidence,
recipient/signature, Return, Reopen, Override, or Reporting workflow is
implemented yet.** Business knowledge and rules live in `Dispatch
Knowledge/` (Topics 01–11) and remain the source of truth; `CLAUDE.md`
governs engineering workflow and safety. See `docs/CTO_SUMMARY_MVP_04.md`
for the full report.

## Architecture overview

| Surface | Stack | Port |
|---|---|---|
| Admin Web | Next.js (App Router) + React + TailwindCSS | 6001 |
| Backend API | NestJS + REST | 6002 |
| Internal Delivery Mobile/PWA | Next.js (App Router) + React + TailwindCSS, PWA-ready | 6003 |
| Database | PostgreSQL 16 + Prisma | internal only (no host port) |
| Evidence storage | Filesystem-backed development adapter on Docker named volume (`dispatch_evidence_data`) | internal API access only |

Monorepo managed with npm workspaces (Node.js 22). Shared, framework-free
foundation packages live under `packages/*`. See `CLAUDE.md` for the full
architecture rules and `Dispatch Knowledge/11 - Technical Architecture...md`
for the approved technical direction.

## Prerequisites

- macOS with Docker Desktop running
- Node.js 22.x (`.nvmrc` pins `22`)
- npm 10+ (ships with Node 22)
- `jq` (used by `scripts/api-smoke-test.sh`)

## Local ports

- Admin Web: <http://localhost:6001>
- Backend API liveness (no database dependency): <http://localhost:6002/health/live>
- Backend API readiness (database-aware): <http://localhost:6002/health/ready>
- Backend API health check (backward-compatible alias of readiness): <http://localhost:6002/health>
- Mobile/PWA: <http://localhost:6003>
- PostgreSQL: internal to the Docker network only (not exposed to the host)

## Local setup (without Docker)

```bash
npm install
npm run build      # builds packages/*, then apps/api, apps/admin-web, apps/mobile-pwa
npm run test        # unit/foundation tests, all workspaces
```

Run an individual app in dev mode, e.g.:

```bash
npm run dev --workspace=apps/admin-web   # http://localhost:6001
npm run start:dev --workspace=apps/api    # NestJS watch mode (default port 3000; set PORT=6002 to match compose)
npm run dev --workspace=apps/mobile-pwa   # http://localhost:6003
```

## Docker Compose startup

```bash
cp .env.example .env   # edit POSTGRES_PASSWORD and JWT_ACCESS_SECRET before first run
# JWT_ACCESS_SECRET has no weak fallback — the API fails to start without a
# high-entropy value. Generate one with:
#   openssl rand -base64 48
docker compose up -d --build
```

This starts `db` (PostgreSQL 16, healthcheck via `pg_isready`), `api`
(NestJS, healthcheck via `GET /health`), `admin-web`, and `mobile-pwa`
(both Next.js production `standalone` builds). `admin-web` and
`mobile-pwa` wait for `api` to report healthy before starting.

`db` has **no host port mapping** by default — it stays internal to the
Docker network, matching the current approved scope.

MVP-03 pre-loading evidence is stored by the API in
`/var/lib/dispatch/evidence`, backed by the persistent
`dispatch_evidence_data` Docker volume. This is a development adapter behind
the API storage interface; production remains targeted at private
S3-compatible object storage. Evidence is never served from a public bucket
or public filesystem route.

## Database development (DEV-FOUNDATION-002)

PostgreSQL has no host port mapping, so Prisma commands that need a real
connection run **inside the Docker network** — normally through the running
`api` container — never against an exposed port, and never via
`prisma migrate dev` or `prisma migrate reset`.

```bash
npm run prisma:generate     # generate the Prisma Client (schema-only, no DB connection)
npm run prisma:validate     # validate prisma/schema.prisma (schema-only, no DB connection)

# Once the stack is up (docker compose up -d --build):
docker compose exec api npx prisma migrate status   # inspect applied/pending migrations
docker compose exec api npx prisma migrate deploy   # apply committed migrations
docker compose exec api npx prisma db seed          # idempotent system-role seed
```

Migration and seed are separate operations: the migration creates the
`users` / `roles` / `user_role_assignments` schema; the seed then
inserts-or-updates exactly the six approved system roles (never a default
User, never a credential). `scripts/db-verify.sh` runs both, plus
read-only verification and the database integration test suite, and
never drops, resets, or truncates anything.

## Authentication (AUTH-001)

- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`,
  `POST /auth/logout-all`, `GET /auth/me`. Health endpoints remain public.
- Short-lived JWT access token (default 15 min), returned in the JSON body
  and held by clients in memory only — never localStorage/sessionStorage/
  IndexedDB.
- Opaque rotating refresh token, delivered only via an HttpOnly
  `dispatch_refresh_token` cookie (`Path=/auth`), never in a JSON body.
  Rotates on every use; reuse of an already-used/revoked token revokes the
  owning session immediately.
- Server-side `AuthSession`/`RefreshTokenRecord` tables provide immediate
  revocation — a request is authorized only if the session is still active
  in PostgreSQL, never from JWT claims alone.
- `loginId` is a neutral technical identifier (not an email/username) —
  normalized by trim + lowercase.
- No default account is ever created. The first `SUPER_ADMIN` is created
  explicitly by an operator:
  ```bash
  npm run auth:bootstrap-super-admin --workspace=apps/api -- \
    --login-id="<loginId>" --display-name="<Display Name>"
  ```
  This command is never run automatically by any script, seed, or Docker
  startup, and prompts for the password interactively (hidden input).

## Customer Master search and Delivery Task creation (MVP-02)

- `POST /customer-master/search` — read-only, bounded, active-only search
  over `Customer`/`CustomerDestination` (no create/edit/delete endpoint
  exists). Every search is recorded as short-lived, server-verifiable
  evidence (`CustomerMasterSearch`) required before a destination may be
  attached to a Task (search-first, BDR-CUSTOMER-001/002).
- `POST /tasks`, `GET /tasks`, `GET /tasks/:id`, `PATCH /tasks/:id` (DRAFT
  only), `POST /tasks/:id/submit` (DRAFT → WAITING_PREPARATION). No
  `DELETE /tasks/:id` exists.
- Every Task carries an immutable Historical Destination Snapshot
  (destination name, address, Destination Source, plus supporting fields)
  that a later Customer Master edit never overwrites.
- RBAC: SUPER_ADMIN/ADMIN/DISPATCHER may search/create/edit/submit;
  SUPER_ADMIN/ADMIN/DISPATCHER/STOCK/MANAGEMENT_AUDITOR may read.
- No start-delivery, DeliveryAttempt, GPS check-in, handover evidence,
  recipient/signature, Return, Reopen, Override, or Reporting workflow
  exists yet — see `docs/CTO_SUMMARY_MVP_04.md`.

## Preparation and pre-loading evidence (MVP-03)

- `POST /tasks/:id/preparation/start` moves
  `WAITING_PREPARATION -> PREPARING` and snapshots immutable planned Task
  items into `PreparationItem` rows.
- `PATCH /tasks/:id/preparation` updates prepared quantities and notes only
  while the Task is `PREPARING`; it cannot change planned snapshots.
- `POST /tasks/:id/preparation/issues` and
  `PATCH /tasks/:id/preparation/issues/:issueId/resolve` record and resolve
  preparation issues. Open issues block ready confirmation.
- `POST /tasks/:id/preparation/evidence` accepts one multipart photo
  (`image/jpeg`, `image/png`, `image/webp`, magic-byte checked, 5 MB max).
  `GET /tasks/:id/preparation/evidence/:evidenceId` streams it privately
  after authentication/RBAC recheck.
- `POST /tasks/:id/preparation/confirm-ready` moves
  `PREPARING -> READY_FOR_DISPATCH` only when every planned item has a
  preparation snapshot, all open issues are resolved, and at least one
  pre-loading photo exists.
- Governance endpoints cover post-`IN_TRANSIT` stock discrepancy reports,
  Admin-created Correction/Exception Records, and Super Admin retrospective
  review. They do not change Main Task Status and are not Emergency Override.

RBAC:

- Preparation read: SUPER_ADMIN, ADMIN, DISPATCHER, STOCK,
  MANAGEMENT_AUDITOR.
- Preparation write/evidence/ready: STOCK, ADMIN, SUPER_ADMIN.
- Correction create: ADMIN.
- Correction review: SUPER_ADMIN.
- INTERNAL_DELIVERY_EMPLOYEE has no access to `/tasks`/`/preparation`
  routes; its own record-scoped read access is served by
  `/assigned-tasks` (MVP-04, below).

## Delivery Task Assignment (MVP-04)

- `POST /tasks/:id/assignment` performs the initial assignment
  (`READY_FOR_DISPATCH -> ASSIGNED`): exactly one primary internal delivery
  employee, zero or more unique supporting employees (informational only —
  no task record scope, no evidence upload, no delivery action, never a
  proxy/shared/temporary authority — BDR-ASSIGN-002), and an optional note.
- `PATCH /tasks/:id/assignment` performs a formal reassignment while
  `ASSIGNED` (status unchanged): requires a non-blank reason and the
  expected current-assignment id as a stale-write precondition — a mismatch
  under the task row lock returns a deterministic `409` with
  `code: "STALE_ASSIGNMENT"`, never a silent overwrite.
- `GET /tasks/:id/assignment` / `GET /tasks/:id/assignment/history` return
  the current assignment and the full append-only assignment/reassignment
  history. No assignment or history `DELETE` endpoint exists
  (BDR-ASSIGN-003/005 — immutable history).
- `GET /assignment-candidates` returns active `INTERNAL_DELIVERY_EMPLOYEE`
  users with a current active-task count (BDR-ASSIGN-004 — existing
  workload never hard-blocks assignment; the UI shows a non-blocking
  warning instead). Only the minimum fields the assignment UI needs are
  returned — no credentials, tokens, or sessions.
- `GET /assigned-tasks` / `GET /assigned-tasks/:id` are the Internal
  Delivery Employee's own record-scoped read-only view: only tasks where
  the caller is the *current primary assignee* — a supporting-only or
  unrelated employee gets `404`, never task data, whether reached through
  the UI or a direct URL/API call (BR-SECURITY-004).
- Database: `TaskAssignment` (append-only event log), `TaskAssignmentSupport`
  (append-only per-assignment supporting employees), and
  `TaskCurrentAssignment` (the only mutable row — a one-row-per-task
  pointer whose primary key on `taskId` is the database-level backstop for
  "at most one current assignment per task", independent of the
  `SELECT ... FOR UPDATE` row lock every assignment/reassignment
  transaction takes on `delivery_tasks` first).

RBAC:

- Assign/reassign/search candidates: SUPER_ADMIN, ADMIN, DISPATCHER.
- Read current assignment/history: SUPER_ADMIN, ADMIN, DISPATCHER, STOCK,
  MANAGEMENT_AUDITOR.
- `/assigned-tasks` (own record scope only): INTERNAL_DELIVERY_EMPLOYEE.

## Verification commands

Run in this order before considering a change complete (see `CLAUDE.md` §10
for the full rationale):

```bash
./scripts/verify.sh          # lint, typecheck, unit tests, builds, Prisma generate/validate, compose config validation
./scripts/docker-verify.sh   # non-destructive build/start + health checks (db/api/admin-web/mobile-pwa)
./scripts/db-verify.sh       # migration deploy, system-role seed, DB inspection, DB integration tests (non-destructive)
./scripts/api-smoke-test.sh  # GET /health, /health/live, /health/ready — foundation endpoints only
./scripts/mobile-verify.sh   # Mobile/PWA reachability + manifest check
./scripts/security-review.sh # dependency audit + secret scan + Docker safety checks
./scripts/e2e-local.sh       # Playwright E2E against the live stack (run when a user flow is affected)
```

`docker-verify.sh`, `db-verify.sh`, and `e2e-local.sh` are non-destructive:
they build/start the stack, apply committed migrations, seed, and check
health, but never run `docker compose down`, `prisma migrate reset`, or any
other teardown/reset command. The stack is intentionally left running
afterward.

## Repository structure

```
Dispatch/
├── apps/
│   ├── admin-web/      # Next.js — Admin Web (login/session shell + Task/preparation/assignment screens)
│   ├── api/             # NestJS — Backend API
│   │   ├── prisma/       # schema.prisma, migrations/, seed.ts
│   │   └── src/
│   │       ├── auth/                       # AUTH-001 — login/refresh/logout, guards, RBAC
│   │       ├── bootstrap/                  # Operator-only initial SUPER_ADMIN CLI
│   │       ├── customer-master/            # MVP-02 — read-only Customer Master search
│   │       ├── tasks/                      # MVP-02 — Delivery Task create/edit/submit
│   │       ├── preparation/                # MVP-03 — preparation, evidence, correction governance
│   │       ├── assignment/                 # MVP-04 — assignment, reassignment, candidates, assigned-tasks
│   │       └── infrastructure/database/     # PrismaModule/Service, repository adapters
│   └── mobile-pwa/      # Next.js PWA — Internal Delivery Mobile/PWA (login/session shell + MVP-04 "My assigned tasks" read-only view)
├── packages/
│   ├── contracts/        # Shared health/readiness + auth + Task/preparation/assignment API contracts
│   ├── domain/            # Framework-independent record types, repository interfaces, business validation
│   ├── shared-types/      # Service identifiers, health/readiness shape, role/status/enum codes
│   ├── validation/        # Generic assertion helpers
│   └── test-utils/        # Shared test assertions
├── e2e/                   # Playwright suite — foundation reachability + MVP-02/MVP-04 flows
├── scripts/               # Verification/security harness scripts (incl. db-verify.sh)
├── docs/                  # Technical docs, CTO summaries, security policy
├── infra/                 # Reserved for future infra-as-code
├── Dispatch Knowledge/     # Business knowledge (authoritative, Topics 01–11)
├── .github/                # CI workflow, PR template
├── docker-compose.yml
├── package.json            # npm workspaces root
└── .env.example
```

## Manual Git workflow

All Git write operations (`add`, `commit`, `push`, `tag`, `merge`) are
performed manually by the project owner — Claude Code / Codex never runs
them. See `CLAUDE.md` §9.

## Current limitations

- No Assignment, DeliveryAttempt, delivery/GPS/handover evidence, Returns,
  Reopen, Emergency Override, notification delivery, or Reporting workflow is
  implemented yet — those remain future milestones per Dispatch Knowledge
  Topic 11 §21 Implementation Roadmap.
- No Customer Master administration (create/edit/delete/merge/import) —
  MVP-02 is read-only search only; Customer/CustomerDestination rows exist
  only via direct, manual, operator-authorized database action.
- BDR-TASK-001 (mandatory business reference-number set) and
  BDR-CUSTOMER-003 (exact frozen-snapshot field set beyond the approved
  minimum) remain **OPEN** business decisions — see
  `docs/CTO_SUMMARY_MVP_02.md`.
- No user-management or role-management UI, no self-registration, no
  password reset, no MFA/SSO — all explicitly out of scope for AUTH-001.
- All health/readiness endpoints remain intentionally unauthenticated
  (required for Docker healthchecks and load balancers).
- Whether a user may hold more than one role at a time is not decided by
  Dispatch Knowledge; `UserRoleAssignment` stays cardinality-neutral and
  AUTH-001 authorization resolves however many roles are assigned.
- Production secret management, cookie `Domain`/`Secure` configuration for
  a real HTTPS domain, and distributed (Redis-backed) rate limiting remain
  unresolved — see `docs/CTO_SUMMARY_AUTH_001.md` Remaining Work.

## No production deployment yet

TDR-DEPLOY-001 (Dispatch Knowledge Topic 11 §22) records that local Docker
Compose on macOS is the only approved deployment target so far. Production
hosting/platform selection remains open and is not implied by anything in
this repository.
