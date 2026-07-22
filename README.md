# Dispatch

Central delivery-task tracking and control system for STEP-SOLUTIONS —
covering task creation, stock preparation, assignment, internal delivery
(GPS check-in, evidence, recipient capture), external courier recording,
returned goods, reopen, emergency override, and audit/reporting.

**Current milestone: DEV-FOUNDATION-002 — Database and API Foundation.**
This repository contains the monorepo skeleton, database-aware
health/readiness endpoints, an initial Prisma/PostgreSQL Identity/Role
technical schema, and local dev tooling. **No Dispatch business workflow,
login, or authentication is implemented yet.** Business knowledge and
rules live in `Dispatch Knowledge/` (Topics 01–11) and remain the source
of truth; `CLAUDE.md` governs engineering workflow and safety.

## Architecture overview

| Surface | Stack | Port |
|---|---|---|
| Admin Web | Next.js (App Router) + React + TailwindCSS | 6001 |
| Backend API | NestJS + REST | 6002 |
| Internal Delivery Mobile/PWA | Next.js (App Router) + React + TailwindCSS, PWA-ready | 6003 |
| Database | PostgreSQL 16 + Prisma (Identity/Role schema only) | internal only (no host port) |

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
cp .env.example .env   # edit POSTGRES_PASSWORD before first run
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
│   ├── admin-web/      # Next.js — Admin Web
│   ├── api/             # NestJS — Backend API
│   │   ├── prisma/       # schema.prisma, migrations/, seed.ts
│   │   └── src/infrastructure/database/  # PrismaModule/Service, repository adapters
│   └── mobile-pwa/      # Next.js PWA — Internal Delivery Mobile/PWA
├── packages/
│   ├── contracts/        # Shared health/readiness contract
│   ├── domain/            # Framework-independent Identity/Role record types + repository interfaces
│   ├── shared-types/      # Service identifiers, health/readiness shape, approved role codes
│   ├── validation/        # Generic assertion helpers
│   └── test-utils/        # Shared test assertions
├── e2e/                   # Playwright foundation reachability suite
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

- No business workflow, no login/authentication, no password/token/session
  storage, and no evidence storage are implemented yet — those are future
  milestones (AUTH-001, MVP-02 onward per Dispatch Knowledge Topic 11 §21
  Implementation Roadmap).
- All health/readiness endpoints are intentionally unauthenticated
  (required for Docker healthchecks and load balancers ahead of AUTH-001).
- The Identity/Role schema (`User`, `Role`, `UserRoleAssignment`) is a
  technical persistence foundation only — no controller, no CRUD API, no
  permission enforcement, and no default User exists. Whether a user may
  hold more than one role at a time is not decided by Dispatch Knowledge
  and remains an AUTH-001 authorization-policy boundary.

## No production deployment yet

TDR-DEPLOY-001 (Dispatch Knowledge Topic 11 §22) records that local Docker
Compose on macOS is the only approved deployment target so far. Production
hosting/platform selection remains open and is not implied by anything in
this repository.
