# Dispatch

## 1. Project

Dispatch — central delivery-task tracking and control system for
STEP-SOLUTIONS. Covers task creation, stock preparation, assignment,
internal delivery (GPS check-in, evidence, recipient capture), external
courier recording, returned goods, reopen, emergency override, and audit/
reporting. Business knowledge lives in `Dispatch Knowledge/` (Topics
01–11); this file governs engineering workflow and safety, not business
rules.

**Current milestone: AUTH-001 — Authentication and RBAC Foundation.**
No Dispatch business workflow is implemented yet.

## 2. Approved Technical Foundation

Product-Owner-authorized (Technical Decision Register, Dispatch Knowledge
Topic 11 §22 — statuses below reflect PO approval, not the document's own
`RECOMMENDED_FOR_APPROVAL` placeholders):

| Area | Decision |
|---|---|
| Repository | Monorepo, npm workspaces |
| Node.js | 22 |
| Admin Web | Next.js (App Router) + React + TailwindCSS |
| Mobile/PWA | Next.js (App Router) + React + TailwindCSS, PWA-ready |
| Backend API | NestJS + REST (command-oriented, not pure CRUD) |
| Database | PostgreSQL 16 |
| ORM direction | Prisma + Repository pattern (Identity/Role technical schema introduced in DEV-FOUNDATION-002; business aggregates remain future work) |
| Auth (AUTH-001, implemented) | Short-lived JWT access token + rotating refresh token + server-side session/revocation store. **This supersedes Topic 11 §5.7's session-based recommendation per explicit Product Owner authorization.** Tokens are never stored in `localStorage`/`sessionStorage`/IndexedDB. |
| Testing | Jest (NestJS native) for `apps/api`; Vitest for `packages/*`, `apps/admin-web`, `apps/mobile-pwa`; Supertest for API integration; Playwright for E2E |
| CI | GitHub Actions |
| Local orchestration | Docker Compose on macOS |
| Evidence storage / Background jobs | Deferred — not introduced in this milestone |

## 3. Ports

| Service | Host port | Notes |
|---|---|---|
| Admin Web | 6001 | |
| Backend API | 6002 | `GET /health` at `/health` |
| Mobile/PWA | 6003 | |
| PostgreSQL | — | internal to Docker network only, no host port by default |

Local URLs: `http://localhost:6001`, `http://localhost:6002/health`,
`http://localhost:6003`.

## 4. Repository Structure

```
Dispatch/
├── apps/
│   ├── admin-web/      # Next.js — Super Admin, Admin, Dispatcher, Stock, Management/Auditor; login/session shell (AUTH-001)
│   ├── api/             # NestJS — health/readiness endpoints; Identity/Role schema; AuthModule (AUTH-001, no business Commands)
│   │   ├── prisma/       # schema.prisma, migrations/, seed.ts (system roles only, no default User)
│   │   └── src/
│   │       ├── auth/                       # AUTH-001 — login/refresh/logout/RBAC, no business workflow
│   │       ├── bootstrap/                  # Operator-only initial SUPER_ADMIN CLI (never automatic)
│   │       └── infrastructure/database/     # PrismaModule/Service, Identity/Role/Session repository adapters
│   └── mobile-pwa/      # Next.js PWA — Internal Delivery Employee; login/session shell (AUTH-001)
├── packages/
│   ├── contracts/        # Shared health/readiness + auth API contract (business Command/Query DTOs are future work)
│   ├── domain/            # Framework-independent Identity/Role/Session record types + repository interfaces — no business aggregates yet
│   ├── shared-types/      # Service identifiers, health/readiness shape, approved role codes
│   ├── validation/        # Generic assertion helpers — no BR-xxx/VR-xxx business rules
│   └── test-utils/        # Shared health-response test assertions
├── e2e/                   # Playwright — foundation reachability suite
├── scripts/               # Harness scripts (see §10)
├── docs/                  # Technical docs, CTO summaries, security policy
├── infra/                 # Reserved for future infra-as-code (empty at this milestone)
├── Dispatch Knowledge/     # Business knowledge — authoritative, not touched by engineering tasks
├── .github/                # CI workflow, PR template
├── docker-compose.yml
├── package.json            # npm workspaces root
└── .env.example
```

## 5. Architecture Rules

- Business rules (BR-xxx/VR-xxx in Dispatch Knowledge Topic 06) are
  authoritative. Engineering tasks implement them; they do not invent new
  business behavior.
- `packages/domain` must never import NestJS, Next.js, Prisma, React, or
  Docker-specific code.
- No Open Business Decision (BDR-xxx, Dispatch Knowledge Topic 07/11 §23) is
  ever resolved by a technical/design choice. If a task's scope would touch
  one, stop and flag it instead of picking a default.
- Append-only history, least privilege, and the 6-role/10-status/2-no-account-group
  model from Topics 03/04 must not be altered by any engineering task.

## 6. Current Milestone

**AUTH-001** — Authentication and RBAC foundation: JWT access/refresh +
server-side session/revocation store, Guard layers 1–2 per Dispatch
Knowledge Topic 11 §10, neutral `loginId`, operator-only SUPER_ADMIN
bootstrap. See `docs/CTO_SUMMARY_AUTH_001.md` for the full report. Prior
milestones: `docs/CTO_SUMMARY_DEV_FOUNDATION_001.md`,
`docs/CTO_SUMMARY_DEV_FOUNDATION_002.md`.

## 7. Current Next Step

**MVP-02** — Customer and Task Creation (`CreateDeliveryTask`, Customer
Master search/free-text) per Topic 11 §21 Implementation Roadmap. Requires
AUTH-001 (complete). Business route-permission matrix, User/Role-management
UI, and production secret/cookie/domain configuration remain unresolved —
see `docs/CTO_SUMMARY_AUTH_001.md` Remaining Work.

---

## 8. Claude Operating Rules

Claude Code / Codex **is responsible for**:
- Inspecting the repository and writing/modifying files within task scope
- Installing dependencies, running builds, lint, typecheck, tests
- Running Docker verification (non-destructively)
- Running security checks
- Producing the CTO Summary

Claude Code / Codex **must NOT**:
- Perform any Git mutation (see §9)
- Run any destructive Docker command (see §11)
- Resolve an open Business Decision Register item via a technical choice
- Implement authentication, login, or business workflow ahead of its
  approved milestone

## 9. Manual Git Rules

Claude/Codex must never run:
- `git add`
- `git commit`
- `git push`
- `git tag`
- `git merge`
- Any command that rewrites history or changes remotes

All Git write operations are performed manually by the user. Claude only
*recommends* a commit message. Read-only inspection (`git status`,
`git diff`, `git log`, `git branch`, `git remote -v`, `git ls-files`) is
always allowed.

## 10. Required Verification Commands

Run in this order before declaring a task PASS:

```bash
./scripts/verify.sh
./scripts/docker-verify.sh
./scripts/db-verify.sh
./scripts/api-smoke-test.sh
./scripts/mobile-verify.sh
./scripts/security-review.sh
```

Run E2E when the task scope affects an executable user flow:

```bash
./scripts/e2e-local.sh
```

A task is **PASS** only if all required commands for its scope exit 0.

| Script | Purpose |
|---|---|
| `scripts/verify.sh` | workspace consistency, lint, typecheck, unit tests, builds, Prisma generate/validate, compose config validation |
| `scripts/docker-verify.sh` | non-destructive build/start + health checks for db/api/admin-web/mobile-pwa |
| `scripts/db-verify.sh` | migration deploy, idempotent system-role seed, read-only DB inspection, DB integration tests — non-destructive, never drops/resets/truncates |
| `scripts/api-smoke-test.sh` | `GET /health`, `/health/live`, `/health/ready` — foundation endpoints only |
| `scripts/mobile-verify.sh` | Mobile/PWA reachability + manifest check |
| `scripts/e2e-local.sh` | builds/starts stack, runs Playwright locally, leaves stack running |
| `scripts/e2e-test.sh` | runs Playwright against an already-running stack (CI/test envs) |
| `scripts/secret-scan.sh` | committed-secret / PEM-key scan |
| `scripts/security-audit.sh` | npm dependency HIGH/CRITICAL audit |
| `scripts/security-review.sh` | combined audit + secret scan + Docker safety/config checks |

## 11. Docker Rules

- Full stack runs via root `docker-compose.yml`: `db`, `api`, `admin-web`, `mobile-pwa`.
- All three app containers run **production builds** (`node dist/main.js` for
  the API; `node server.js` from Next's `output: "standalone"` for the two
  Next apps) — never `next dev` or `nest start --watch`.
- `api` healthcheck probes `GET /health`. `admin-web`/`mobile-pwa` depend on
  `api` being healthy.
- `db` (PostgreSQL 16) has **no host port mapping** by default — internal to
  the Docker network only.
- Verify with `docker compose ps` — all services must be `healthy`/`Up`.

### Docker Safety Rules

Claude/Codex must never run:
- `docker compose down` (with or without `-v`)
- `docker system prune`, `docker volume rm`, `docker volume prune`, `docker
  container rm`, `docker image rm`, `docker network rm`
- Any command that stops, removes, or destructively resets containers
  without explicit user approval

Allowed inspection/build commands (no approval needed): `docker ps`,
`docker ps -a`, `docker compose ps`, `docker compose logs`, `docker compose
config`, `docker volume ls`, `docker compose up -d --build` (as run by
`scripts/docker-verify.sh`), HTTP health-check curls.

`scripts/docker-verify.sh` and `scripts/e2e-local.sh` both carry a
self-guard that greps their own source for forbidden Docker commands and
refuse to run if one is found — a defense against future edits accidentally
reintroducing a teardown call.

## 12. API Rules

- NestJS, TypeScript, REST, command-oriented resource design (per Topic 11
  §17) for future business endpoints — not pure CRUD.
- Health/readiness endpoints are public (`@Public()`, exempt from the
  global auth guard):
  - `GET /health/live` — process liveness, no database dependency. Body is
    exactly `{"status":"ok","service":"dispatch-api"}`.
  - `GET /health/ready` — database-aware readiness (`SELECT 1`). Body is
    exactly `{"status":"ok","service":"dispatch-api","database":"ok"}` on
    success; HTTP 503 with a generic body (no host/credential/SQL detail)
    on database failure.
  - `GET /health` — backward-compatible alias of `/health/ready`.
- Identity/Role/Session persistence (`User`, `Role`, `UserRoleAssignment`,
  `AuthSession`, `RefreshTokenRecord` via Prisma) exists as of AUTH-001 —
  `User.passwordHash`/`loginIdNormalized`/`credentialsEnabled` are
  nullable/off-by-default, no default User is ever seeded or bootstrapped
  automatically, no plaintext password/token is ever persisted.
- Authentication (`apps/api/src/auth/`): `POST /auth/login`,
  `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/logout-all`,
  `GET /auth/me`. `JwtAuthenticationGuard` is global (`APP_GUARD`) — every
  route requires a valid access token unless `@Public()`. `RolesGuard` +
  `@Roles(...)` resolve authorization from PostgreSQL per-request, never
  from JWT/client-supplied role claims. Do not add Delivery Task or other
  business modules until their approved milestone (see Topic 11 §21).
- Production start command runs compiled `dist/main.js`, never `nest
  start --watch`. Migrations/seed never run automatically at container
  startup — see §11 and `scripts/db-verify.sh`. The SUPER_ADMIN bootstrap
  CLI (`npm run auth:bootstrap-super-admin --workspace=apps/api`) is an
  explicit operator action, never run automatically by any script,
  container startup, or seed.

## 13. Mobile/PWA Rules

- Next.js App Router, React, TypeScript, TailwindCSS, PWA-ready structure
  (`app/manifest.ts`).
- Admin Web and Mobile/PWA both implement the AUTH-001 login/session shell:
  access token in memory only (never localStorage/sessionStorage/
  IndexedDB), refresh token only via the HttpOnly cookie the browser
  manages, one-shot session bootstrap on load, generic login error, logout.
  No role-based delivery workflow, GPS, camera/evidence capture, or
  generated icon assets until their approved milestone.
- Production container serves Next's `output: "standalone"` build.

## 14. CTO Summary Format

See `docs/CTO_SUMMARY_TEMPLATE.md`. Every completed task produces a CTO
Summary using that template, saved as
`docs/CTO_SUMMARY_<TASK_ID>.md`.

## 15. Security Review Requirements

Every task's CTO Summary must include a Security Review section (see
template). Full policy: `docs/SECURITY_HARNESS.md`. Checklist:
`docs/SECURITY_REVIEW_CHECKLIST.md`. Patch rules:
`docs/SECURITY_PATCH_POLICY.md`. Findings log: `docs/SECURITY_REVIEW_LOG.md`.

Run before declaring done:
```bash
./scripts/security-review.sh
```

## 16. Security FAIL Conditions

A task must NOT be declared PASS if any of the following are true:

- Password, token, or hash value exposed in logs, response, or source
- New endpoint missing an appropriate auth guard or role check
- RBAC bypass possible via crafted request
- Secret committed to source control
- HIGH or CRITICAL dependency vulnerability without a patch or a documented
  accepted-risk entry (`.security-accepted-risks` + `docs/SECURITY_REVIEW_LOG.md`)
- Destructive Docker command used without explicit user approval
- Fabricated external advisory details in a CTO Summary
- An Open Business Decision Register item resolved via technical choice

## 17. Docker Safety Rules

See §11 — duplicated here per required-sections convention. The rules in
§11 are authoritative; this section exists only so Docker safety appears
under its own heading as required by the operating template.

## 18. GitHub / CI Workflow

- `.github/workflows/ci.yml` runs on `pull_request` and `push` to `main`:
  lint, typecheck, unit/foundation tests, builds (all workspaces), a
  `docker compose config` validation job, and the security audit + secret
  scan job. It uses Node.js 22 and `npm ci`.
- Full Docker build/start/health verification and the Playwright E2E suite
  are **local required gates**, not CI jobs, in this milestone — see
  `docs/SECURITY_HARNESS.md` and `.github/workflows/ci.yml`'s scope note for
  the reasoning.
- CI never deploys, never pushes commits/tags, and never uses real
  production secrets.
- **Remote GitHub Actions status is always reported as "NOT YET RUN" until
  the user pushes and reports the result.** Claude/Codex cannot know the
  remote CI outcome and must never claim it passed.

## 19. Business Decision Safety

Dispatch Knowledge Topics 01–10 are the single source of truth for business
rules, and Topic 11 is the approved technical architecture translation.
Engineering tasks:
- Never modify Topics 01–10.
- Never resolve an open BDR (Business Decision Register item) through a
  technical/design default — see §20.
- May update Topic 11 only to synchronize Product-Owner-approved technical
  decisions (e.g. flipping a TDR row from a placeholder status to
  `APPROVED`), never to change business rules or scope.

## 20. Open BDR Protection

As of DEV-FOUNDATION-001, Dispatch Knowledge Topic 11 §23 lists open items
(BDR-RETURN-007, BDR-RETURN-009, and others referenced there) that remain
unresolved. This foundation milestone touches none of them — no Returned
Goods, Reopen, or Emergency Override code exists yet. Future tasks that
approach these areas must:
- Design Policy/Guard extension points (per Topic 11 §2 principle 10) that
  allow adding the rule later without a schema/aggregate rewrite.
- Never hardcode a default answer to an open BDR "just to make progress."
- Flag the conflict to the user instead of guessing.
