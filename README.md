# Dispatch

Central delivery-task tracking and control system for STEP-SOLUTIONS —
covering task creation, stock preparation, assignment, internal delivery
(GPS check-in, evidence, recipient capture), external courier recording,
returned goods, reopen, emergency override, and audit/reporting.

**Current milestone: MVP-02 — Customer and Task Creation.** Prior
milestone AUTH-001 (Authentication and RBAC Foundation) is complete:
login/refresh/logout with short-lived JWT access tokens, rotating opaque
refresh tokens, server-side session/revocation storage, and RBAC guards.
MVP-02 adds the first Dispatch business capability: read-only Customer/
Destination Master search (search-first, BDR-CUSTOMER-001/002), and
Delivery Task creation/editing/submission (DRAFT → WAITING_PREPARATION)
with an immutable Historical Destination Snapshot. **No Preparation,
Assignment, Delivery, Return, Reopen, Override, or Reporting workflow is
implemented yet.** Business knowledge and rules live in
`Dispatch Knowledge/` (Topics 01–11) and remain the source of truth;
`CLAUDE.md` governs engineering workflow and safety. See
`docs/CTO_SUMMARY_MVP_02.md` for the full report.

## Architecture overview

| Surface | Stack | Port |
|---|---|---|
| Admin Web | Next.js (App Router) + React + TailwindCSS | 6001 |
| Backend API | NestJS + REST | 6002 |
| Internal Delivery Mobile/PWA | Next.js (App Router) + React + TailwindCSS, PWA-ready | 6003 |
| Database | PostgreSQL 16 + Prisma (Identity/Role/Session schema) | internal only (no host port) |

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
- No Preparation, Assignment, Delivery, Return, Reopen, Override, or
  Reporting workflow exists yet — see `docs/CTO_SUMMARY_MVP_02.md`.

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
│   ├── admin-web/      # Next.js — Admin Web (login/session shell + MVP-02 Task screens)
│   ├── api/             # NestJS — Backend API
│   │   ├── prisma/       # schema.prisma, migrations/, seed.ts
│   │   └── src/
│   │       ├── auth/                       # AUTH-001 — login/refresh/logout, guards, RBAC
│   │       ├── bootstrap/                  # Operator-only initial SUPER_ADMIN CLI
│   │       ├── customer-master/            # MVP-02 — read-only Customer Master search
│   │       ├── tasks/                      # MVP-02 — Delivery Task create/edit/submit
│   │       └── infrastructure/database/     # PrismaModule/Service, repository adapters
│   └── mobile-pwa/      # Next.js PWA — Internal Delivery Mobile/PWA (login/session shell only; no MVP-02 UI)
├── packages/
│   ├── contracts/        # Shared health/readiness + auth + MVP-02 Task/Customer-Master API contract
│   ├── domain/            # Framework-independent record types, repository interfaces, business validation
│   ├── shared-types/      # Service identifiers, health/readiness shape, role/status/enum codes
│   ├── validation/        # Generic assertion helpers
│   └── test-utils/        # Shared test assertions
├── e2e/                   # Playwright suite — foundation reachability + MVP-02 Task creation flow
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

- No Preparation, Assignment, delivery/GPS/evidence, Returns, Reopen,
  Emergency Override, Correction Action, or Reporting workflow is
  implemented yet — those begin at MVP-03+ per Dispatch Knowledge Topic 11
  §21 Implementation Roadmap.
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
