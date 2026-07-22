# Dispatch

Central delivery-task tracking and control system for STEP-SOLUTIONS —
covering task creation, stock preparation, assignment, internal delivery
(GPS check-in, evidence, recipient capture), external courier recording,
returned goods, reopen, emergency override, and audit/reporting.

**Current milestone: DEV-FOUNDATION-001 — Repository and Tooling
Foundation.** This repository currently contains only the monorepo
skeleton, health-check endpoints, and local dev tooling. **No Dispatch
business workflow is implemented yet.** Business knowledge and rules live
in `Dispatch Knowledge/` (Topics 01–11) and remain the source of truth;
`CLAUDE.md` governs engineering workflow and safety.

## Architecture overview

| Surface | Stack | Port |
|---|---|---|
| Admin Web | Next.js (App Router) + React + TailwindCSS | 6001 |
| Backend API | NestJS + REST | 6002 |
| Internal Delivery Mobile/PWA | Next.js (App Router) + React + TailwindCSS, PWA-ready | 6003 |
| Database | PostgreSQL 16 | internal only (no host port) |

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
- Backend API health check: <http://localhost:6002/health>
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

## Verification commands

Run in this order before considering a change complete (see `CLAUDE.md` §10
for the full rationale):

```bash
./scripts/verify.sh          # lint, typecheck, unit tests, builds, compose config validation
./scripts/docker-verify.sh   # non-destructive build/start + health checks (db/api/admin-web/mobile-pwa)
./scripts/api-smoke-test.sh  # GET /health — foundation endpoints only
./scripts/mobile-verify.sh   # Mobile/PWA reachability + manifest check
./scripts/security-review.sh # dependency audit + secret scan + Docker safety checks
./scripts/e2e-local.sh       # Playwright E2E against the live stack (run when a user flow is affected)
```

`docker-verify.sh` and `e2e-local.sh` are non-destructive: they build/start
the stack and check health, but never run `docker compose down` or any
other teardown command. The stack is intentionally left running afterward.

## Repository structure

```
Dispatch/
├── apps/
│   ├── admin-web/      # Next.js — Admin Web
│   ├── api/             # NestJS — Backend API (GET /health only in this milestone)
│   └── mobile-pwa/      # Next.js PWA — Internal Delivery Mobile/PWA
├── packages/
│   ├── contracts/        # Shared health contract
│   ├── domain/            # Framework-independent branded-ID helper
│   ├── shared-types/      # Service identifiers, health response shape
│   ├── validation/        # Generic assertion helpers
│   └── test-utils/        # Shared test assertions
├── e2e/                   # Playwright foundation reachability suite
├── scripts/               # Verification/security harness scripts
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

- No business workflow, no login/authentication, no database schema, and no
  evidence storage are implemented yet — those are future milestones
  (AUTH-001, DEV-FOUNDATION-002, MVP-02 onward per Dispatch Knowledge Topic
  11 §21 Implementation Roadmap).
- `GET /health` is intentionally unauthenticated (required for Docker
  healthchecks and load balancers ahead of AUTH-001).
- PostgreSQL runs in Docker Compose but nothing connects to it yet — no
  Prisma schema exists in this milestone.

## No production deployment yet

TDR-DEPLOY-001 (Dispatch Knowledge Topic 11 §22) records that local Docker
Compose on macOS is the only approved deployment target so far. Production
hosting/platform selection remains open and is not implied by anything in
this repository.
