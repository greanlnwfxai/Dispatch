# CTO Summary
## Task
DEV-FOUNDATION-001 — Repository and Tooling Foundation

> **Amended 2026-07-22 by DEV-FOUNDATION-001A** (Technical Decision
> Synchronization and Final QA) — this summary was updated in place to
> report the governance synchronization of Dispatch Knowledge Topic 11 with
> the TDR statuses actually approved by the Product Owner, plus a full
> re-run of the required verification suite. No application code or Git
> history was changed by this amendment. See the "Governance and Safety
> Confirmation" section below for the complete DEV-FOUNDATION-001A report.

> **Amended 2026-07-22 by DEV-FOUNDATION-001B** (Fix Clean-CI Workspace
> Dependency Ordering) — the first push of the commit reported PASS below
> (`cf4c8f6`) failed on GitHub Actions run **29882143366** during
> `Build, Lint, Typecheck, Test` → `Typecheck (all workspaces)`, because a
> clean `npm ci` checkout has no `packages/*/dist` and the shared packages'
> `main`/`types` fields point at `./dist`. Local verification had not
> caught this because locally-generated `dist`/`.next` directories already
> existed on the development machine. This amendment records the confirmed
> root cause and the fix (deterministic `build:packages` step run before
> any workspace command that resolves compiled package entry points). No
> business workflow, business rule, or Git history was touched. See the
> "CI Follow-up (DEV-FOUNDATION-001B)" section below for the complete
> report.

## Status (PASS / FAIL)
PASS

## Scope
Stand up the Dispatch monorepo and local dev tooling foundation (npm
workspaces, NestJS API skeleton with `GET /health` only, two Next.js
foundation-status pages, PostgreSQL via Docker Compose, harness scripts,
CI skeleton, and documentation) with zero Dispatch business workflow.

## Technical Decisions Applied

**Governance note (DEV-FOUNDATION-001A synchronization, 2026-07-22):** This
task's original PASS was correct on substance, but Dispatch Knowledge Topic
11 §22 (Technical Decision Register) still carried its pre-approval
`RECOMMENDED_FOR_APPROVAL`/`TECHNICAL_DECISION_REQUIRED` placeholder
statuses from the TECH-ARCH-001 draft, and §5.7's Authentication/Session
Strategy subsection still recommended Session-based + Redis even though the
Product Owner had authorized the JWT direction below. A follow-up task
(DEV-FOUNDATION-001A) performed a surgical documentation-only sync: Topic 11
was updated throughout (Document Control, §1.6, §5 header and all affected
subsections, §21 Implementation Roadmap, §22 Technical Decision Register,
§25 Acceptance Checklist) so its TDR statuses and Authentication wording
match the decisions actually approved and implemented here. No application
code, business logic, or Git history was touched by that sync.

Per Product Owner authorization, the following 9 TDRs are `APPROVED` for the
DEV-FOUNDATION-001 scope (Topic 11 §22 is now the synchronized record):
- TDR-REPO-001 — Monorepo, npm workspaces
- TDR-WEB-001 — Next.js (App Router) + React + TailwindCSS
- TDR-MOBILE-001 — React/Next.js PWA
- TDR-API-001 — NestJS + REST (command-oriented direction recorded, no commands implemented yet)
- TDR-DATABASE-001 — PostgreSQL 16 (provisioned, not yet connected to by the API)
- TDR-ORM-001 — Prisma + Repository pattern (direction only — Prisma business schema/migrations remain out of scope until DEV-FOUNDATION-002)
- TDR-AUTH-001 — JWT short-lived access token + rotating refresh token + server-side session/revocation store (PO-authorized direction, **supersedes** Topic 11 §5.7's original session-based+Redis recommendation; **not implemented** in this milestone — AUTH-001 is a future milestone; tokens must never be stored in `localStorage`)
- TDR-TEST-001 — Jest (NestJS native) for `apps/api`; Vitest for `packages/*`/`apps/admin-web`/`apps/mobile-pwa`; Supertest for API integration; Playwright for E2E
- TDR-CI-001 — GitHub Actions

**TDR-DEPLOY-001 — approved only in part:**
- **Approved**: local development on macOS using Docker Compose (Admin Web
  6001, API 6002, Mobile/PWA 6003, PostgreSQL internal-only, no host port
  mapping) — as implemented in `docker-compose.yml`.
- **Still unresolved/deferred**: production hosting platform, production
  orchestration/platform selection, production infrastructure topology.
  TDR-DEPLOY-001's overall status remains `TECHNICAL_DECISION_REQUIRED` in
  Topic 11 §22 — it is **not** marked fully `APPROVED`, and no
  `PARTIALLY_APPROVED` status was invented (not a value the register
  allows); the row instead documents the local/production split explicitly.

**Left unchanged (not approved, not touched by this task):**
- TDR-STORAGE-001 — remains `TECHNICAL_DECISION_REQUIRED`.
- TDR-JOBS-001 — remains `DEFERRED`.
- Production platform for TDR-DEPLOY-001 — remains unapproved (see above).

## Files Created
85 files across:
- `package.json`, `package-lock.json`, `tsconfig.base.json`, `.nvmrc`, `.env.example`, `.dockerignore`, `eslint.config.mjs` (root)
- `packages/{shared-types,domain,validation,contracts,test-utils}/` — package.json, tsconfig.json, `src/index.ts` + `src/index.test.ts` each
- `apps/api/` — NestJS skeleton (`src/main.ts`, `src/app.module.ts`, `src/health/*`, unit spec, `test/health.e2e-spec.ts`, `Dockerfile`, `nest-cli.json`, `tsconfig.json`)
- `apps/admin-web/` — Next.js App Router skeleton (`layout.tsx`, `page.tsx`, `globals.css`, Vitest test, `Dockerfile`, Tailwind v4/PostCSS config, `eslint.config.mjs`)
- `apps/mobile-pwa/` — same pattern plus `app/manifest.ts` (PWA manifest route) and its test
- `e2e/` — Playwright foundation reachability suite (`playwright.config.ts`, `tests/foundation.spec.ts`)
- `scripts/` — all 9 required harness scripts (`verify.sh`, `docker-verify.sh`, `api-smoke-test.sh`, `mobile-verify.sh`, `e2e-local.sh`, `e2e-test.sh`, `secret-scan.sh`, `security-audit.sh`, `security-review.sh`)
- `docker-compose.yml`
- `.github/workflows/ci.yml`, `.github/pull_request_template.md`
- `docs/{SECURITY_HARNESS,SECURITY_REVIEW_CHECKLIST,SECURITY_PATCH_POLICY,SECURITY_REVIEW_LOG,CTO_SUMMARY_TEMPLATE,CTO_SUMMARY_DEV_FOUNDATION_001}.md`
- `CLAUDE.md`, `README.md`, `infra/README.md`, `.security-accepted-risks`

## Files Modified
- `.gitignore` — added node_modules/dist/.next/coverage/env-file/Playwright-artifact/`*.tsbuildinfo` exclusions
- `Dispatch Knowledge/11 - Technical Architecture และแผนพัฒนา MVP.md` — **DEV-FOUNDATION-001A governance synchronization only** (no business rule, Role, Status, BR/VR/BDR was added, changed, or resolved): Document Control (updated date, version, synchronization note), summary callout, §0 Scope/out-of-scope statements, §1.6, §5 header warning and the 9 approved subsections (§5.1–5.4, 5.6, 5.10–5.13), §5.5 (ORM — approved direction, schema/migration still out of scope until DEV-FOUNDATION-002), §5.7 (Authentication — replaced obsolete Session-based+Redis recommendation with the approved JWT+rotating-refresh+server-side-revocation-store direction, marked not-yet-implemented), §5.12/§22 TDR-DEPLOY-001 (local-vs-production split), §20 (added a sync note distinguishing the full future conceptual proposal — Postgres+MinIO+dev servers — from what DEV-FOUNDATION-001 actually implemented — Postgres only, no MinIO since TDR-STORAGE-001 is still open, production builds not dev servers), §21 Implementation Roadmap, §22 Technical Decision Register (full status sync), §25 Acceptance Checklist (annotated, not falsified — historical "nothing approved" statement preserved with a current-status note). Five pre-existing cross-reference/consistency errors were corrected as direct factual contradictions found while editing those exact lines: §0 summary callout and out-of-scope statement pointed to "หมวด 23"/"หมวด 6" instead of the correct §22 (Technical Decision Register) / §5 (Technology Stack Evaluation); §5.7's RBAC guard reference pointed to "หมวด 11" instead of §10 (Authorization Architecture); §5.11's Testing Framework candidate row pointed to "หมวด 20" instead of §19 (Testing Architecture); and §0's scope statement listed "Technology Stack Evaluation (ยังไม่อนุมัติ)" as an unqualified present-tense claim, now scoped to "ณ ร่างต้นฉบับ 2026-07-21."

## Verification Result

**Original DEV-FOUNDATION-001 run:**
- `./scripts/verify.sh` → **PASS** (workspace consistency, lint, typecheck, unit tests, build of all 8 workspaces, `docker compose config`)
- `./scripts/docker-verify.sh` → **PASS** (db/api healthy, `GET /health` body exact match, admin-web/mobile-pwa reachable)
- `./scripts/api-smoke-test.sh` → **PASS** (HTTP 200, `status=ok`, `service=dispatch-api`, exactly 2 fields)
- `./scripts/mobile-verify.sh` → **PASS** (HTTP 200, "Dispatch Mobile/PWA" marker, valid `manifest.webmanifest`)
- `./scripts/security-review.sh` → **PASS** (0 dependency vulnerabilities, 0 secret findings, compose config valid, no destructive commands in scripts)
- `./scripts/e2e-local.sh` → **PASS** (ran manually against the live stack rather than via the script's own build step, since the stack was already up from `docker-verify.sh`; all 3 Playwright tests passed: Admin Web reachable/marker, Mobile/PWA reachable/marker, API health body)

**DEV-FOUNDATION-001A re-verification (2026-07-22, after the Topic 11 sync, against the already-running stack — not torn down):**
- `./scripts/verify.sh` → **PASS** (lint/typecheck/unit tests/build for all 8 workspaces + `docker compose config`, re-run clean after the documentation-only change — no application code was touched, so no regression risk was expected or found)
- `./scripts/api-smoke-test.sh` → **PASS**
- `./scripts/mobile-verify.sh` → **PASS**
- `./scripts/security-review.sh` → **PASS** (dependency audit 0 HIGH/CRITICAL, secret scan 0 findings, compose config valid, no destructive Docker commands in scripts)
- `./scripts/e2e-test.sh` → **PASS** (run against the already-running stack per its documented purpose; all 3 Playwright tests passed: Admin Web reachable/marker, Mobile/PWA reachable/marker, API health body)
- `docker compose config` and `docker compose ps` → all four services are running; `db` and `api` report Docker healthcheck status `healthy`, while `admin-web` and `mobile-pwa` passed HTTP reachability verification; stack left running (not torn down)
- `bash -n` on all 9 harness scripts (`verify.sh`, `docker-verify.sh`, `api-smoke-test.sh`, `mobile-verify.sh`, `e2e-local.sh`, `e2e-test.sh`, `secret-scan.sh`, `security-audit.sh`, `security-review.sh`) → **all syntactically valid**
- `npm ls --workspaces --all` → exit 0, no `invalid:` or non-optional missing entries; 165 `UNMET OPTIONAL DEPENDENCY` lines, all expected platform-specific native-binary optionals (e.g. `@tailwindcss/oxide-*`, `@esbuild/*`, `@rollup/rollup-*`, `lightningcss-*` for OS/arch combinations other than the current macOS arm64 host) — not a defect
- `npm ls typescript next @nestjs/core vitest sharp postcss` → confirms the intended override resolution: `typescript@5.9.3` (overridden, deduped everywhere), `sharp@0.35.3` (under `next`), `postcss@8.5.21` (deduped), `next@16.2.11`, `@nestjs/core@11.1.28`, `vitest@4.1.10` — no conflicting versions in the tree
- Direct file QA: no merge-conflict markers, no trailing whitespace, no `.env` committed, all 9 `scripts/*.sh` carry the executable bit (`-rwxr-xr-x`), `git diff --check` clean

**Test runners confirmed directly from each workspace's `package.json` (not assumed):** `apps/api` → `"test": "jest"` (root-level `jest` config block with `ts-jest` transform) + `"test:e2e": "jest --config ./test/jest-e2e.json"`; `apps/admin-web`, `apps/mobile-pwa`, and all five `packages/*` → `"test": "vitest run"`; `e2e/` → `"test:e2e": "playwright test"`. This matches CLAUDE.md §2's Testing row and is now reflected in Topic 11 §22's TDR-TEST-001 row (previous Topic 11 draft had recommended Vitest-only for `apps/api`, which does not match the implementation).

## Docker Verification Result
All four services running; `db` and `api` healthy via Docker healthcheck; `admin-web` and `mobile-pwa` verified through HTTP reachability; stack left up (non-destructive, as required):
```
dispatch-admin-web    Up   0.0.0.0:6001->6001/tcp
dispatch-api           Up (healthy)   0.0.0.0:6002->3000/tcp
dispatch-db             Up (healthy)   5432/tcp (no host port mapping)
dispatch-mobile-pwa    Up   0.0.0.0:6003->6003/tcp
```
Verified directly: `GET http://localhost:6002/health` → `{"status":"ok","service":"dispatch-api"}`; admin-web and mobile-pwa pages render their foundation-status markers and link to the health URL; mobile-pwa's `/manifest.webmanifest` returns valid PWA metadata. All three app containers run as non-root users (`dispatch`, `nextjs`); none are privileged.

## GitHub/CI Foundation
`.github/workflows/ci.yml` added with three jobs: `Build, Lint, Typecheck, Test` (all workspaces via `npm ci`, Node 22), `Compose — Config Validation` (`docker compose config` only, no image builds), and `Security — Audit & Secret Scan`. Full Docker build/health verification and Playwright E2E are documented as required **local** gates rather than CI jobs (see `.github/workflows/ci.yml` scope note and `docs/SECURITY_HARNESS.md`) to keep initial CI fast and reliable — this is an explicit scope decision. `.github/pull_request_template.md` added with scope/verification/security checklists.

**Remote GitHub Actions status: NOT YET RUN.** This workflow has not executed on GitHub — it will run once the user pushes.

## Issues Found
Resolved during the build (none blocking the final result):
1. **NestJS 10.x + Vitest 2.x pulled in 26 vulnerabilities (7 HIGH, 1 CRITICAL)** — fixed by bumping `@nestjs/*` to `^11.1.28`, `@nestjs/cli` to `^11.0.24`, and `vitest` to `^4.1.10` across all five packages, then `npm audit fix` (no `--force`) for the remainder. Result: 0 vulnerabilities.
2. **Next.js 16's internal `sharp`/`postcss` copies carried HIGH/MODERATE advisories** — fixed via root `package.json` `overrides` (`sharp@^0.35.3`, `postcss@^8.5.21`) rather than downgrading Next. See `docs/SECURITY_REVIEW_LOG.md`.
3. **`typescript` version drift** (unconstrained peer ranges from `eslint-config-next`/`ts-jest`/`@nestjs/cli` transitively resolved a newer major at the top of the tree than our own `^5.6.3` pin) **caused a real Docker build failure** (`TS5107: moduleResolution=node10 deprecated` treated as an error) that did not reproduce locally until investigated — fixed by pinning `typescript` to a single version via root `overrides` and dropping the explicit (now-deprecated) `moduleResolution: "Node10"` setting from `tsconfig.base.json`/`apps/api/tsconfig.json`.
4. **`next lint` was removed in Next.js 16** — both Next apps' `lint` script switched to direct `eslint .` invocation; ESLint 9 flat config required migrating off the legacy `.eslintrc.json` format repo-wide (root `eslint.config.mjs` for TS-only workspaces, native `eslint-config-next/core-web-vitals` flat export for the two Next apps — `FlatCompat` hit an unrelated circular-JSON crash and was avoided).
5. **React Testing Library needed an explicit `afterEach(cleanup)`** (no implicit `afterEach` global without `test.globals: true`) — added `vitest.setup.ts` to both Next apps.
6. **Supertest's CJS export broke under `import * as request`** — switched to a default import in the API's e2e spec.
7. **Docker builder stage initially omitted the root `package.json`** — first API image build failed with `ENOENT`; fixed across all three Dockerfiles.

### Dependency Remediation Detail (per DEV-FOUNDATION-001A reporting requirement)

- **Initial `npm audit` findings**: 26 vulnerabilities (7 HIGH, 1 CRITICAL), traced to the initial NestJS 10.x + Vitest 2.x + stock Next.js 16 `sharp`/`postcss` transitive tree (see Issues #1–2 above).
- **Actual remediation performed**: (a) direct version bumps — `@nestjs/common`/`@nestjs/core`/`@nestjs/platform-express`/`@nestjs/testing` → `^11.1.28`, `@nestjs/cli` → `^11.0.24`, `vitest` → `^4.1.10`, applied across all five affected `package.json` files; (b) `npm audit fix` (no `--force`) for the remainder; (c) root-level `overrides` for three packages that could not be fixed by direct bumps because they are transitive dependencies of `next`/`ts-jest`/`eslint-config-next`.
- **Exact package overrides used** (root `package.json`):
  ```json
  "overrides": {
    "sharp": "^0.35.3",
    "postcss": "^8.5.21",
    "typescript": "5.9.3"
  }
  ```
- **Final audit result**: `npm audit` → **0 vulnerabilities** (confirmed again in the DEV-FOUNDATION-001A re-run above).
- **This is not considered safe merely because `npm audit` reports zero.** An override can silently break a build or runtime behavior even with a clean audit. Safety here is based on the combined evidence that, with the overrides applied: `npm ci` (lockfile-exact install) succeeded, `npm run build` succeeded for all 8 workspaces, all unit/foundation tests passed (Jest for `apps/api`, Vitest for the rest), `./scripts/docker-verify.sh` passed (all four containers running with production builds; `db` and `api` healthy via Docker healthcheck; `admin-web` and `mobile-pwa` passed HTTP reachability checks), and the Playwright E2E suite passed against the live stack — both in the original DEV-FOUNDATION-001 run and again in this DEV-FOUNDATION-001A re-verification pass. `npm ls typescript next @nestjs/core vitest sharp postcss` confirms the override versions are the ones actually resolved in the tree, not merely declared.

## Risk (Low / Medium / High)
Low. No business logic, no auth, no data persistence path is exercised. All changes are additive to a previously docs-only repository.

## Security Review
| Field | Description |
|---|---|
| Auth impact | None — no auth code exists. `/health` is intentionally unguarded (required for Docker healthchecks; documented in `CLAUDE.md` §12). |
| RBAC impact | None — no role checks exist yet. |
| Data privacy impact | None — no PII, no data model. `/health` response is exactly `{status, service}`. |
| Password/token/hash impact | None — no password/token/hash code exists anywhere in the repo. |
| Mobile security impact | None yet — no GPS/camera/evidence code; PWA manifest carries no secrets. |
| Dependency/advisory impact | Started at 26 findings (7 HIGH, 1 CRITICAL) during setup; resolved to **0 vulnerabilities** via version bumps + `overrides` (see Issues Found #1–2 and `docs/SECURITY_REVIEW_LOG.md`). No accepted-risk entries were needed. |
| Secrets/logging check | `scripts/secret-scan.sh` — 0 findings. No `.env` committed (verified via `git ls-files`). `.env.example` uses only placeholder values. |
| New endpoints protected | `GET /health` — intentionally public, no guard, no sensitive data returned. No other endpoints exist. |
| Docker safety impact | Non-root users in all three app containers (verified via `docker exec ... whoami`/`id`); none privileged (verified via `docker inspect ... HostConfig.Privileged` → `false` for all three); `db` has no host port mapping (verified via `docker port dispatch-db` → empty); all harness scripts carry a self-guard against destructive Docker commands. |
| Risk level | LOW |
| Security decision | PASS |

## Decision (PASS / FAIL)
PASS

## Governance and Safety Confirmation (DEV-FOUNDATION-001A synchronization)
- **No authentication implementation was added.** TDR-AUTH-001's JWT + rotating refresh + server-side revocation store direction is recorded as `APPROVED` (architecture direction only) in Topic 11 §22/§5.7; no login, JWT, guard, session, or revocation-store code exists anywhere in the repository.
- **No business workflow was added.** No Delivery Task, Customer Master, Preparation, Assignment, GPS check-in, Recipient, Evidence, Returned Goods, Reopen, Emergency Override, Correction, Formal Investigation, or Reporting code exists. `GET /health` remains the only endpoint.
- **No Open Business Decision Register item was resolved.** BDR-RETURN-007, BDR-RETURN-009, and all other open BDRs referenced in Topic 11 §23 remain untouched and unresolved by this synchronization pass.
- **No Git mutation was performed.** No `git add`, `git commit`, `git push`, `git tag`, `git merge`, or history rewrite was run. Only read-only inspection commands (`git status`, `git diff`, `git ls-files`) were used.
- **No destructive Docker command was performed.** The stack was already running at the start of this task and was left running; only read-only/non-destructive commands were used (`docker compose ps`, `docker compose config`). No `docker compose down`, `docker system prune`, volume/container/image/network removal, or any teardown command was executed.
- **Remote GitHub Actions status at DEV-FOUNDATION-001A completion:** `NOT YET RUN` at that time. After commit `cf4c8f6` was pushed, GitHub Actions run `29882143366` executed and failed at `Typecheck (all workspaces)`. See the DEV-FOUNDATION-001B CI Follow-up below. The corrected DEV-FOUNDATION-001B workflow remains `NOT YET RUN` because this fix has not yet been pushed.

## CI Follow-up (DEV-FOUNDATION-001B — 2026-07-22)

### Failed run
GitHub Actions run **29882143366**, triggered by the push of `cf4c8f6`
(`feat(dispatch): add repository and tooling foundation`).

### Failure stage
Job `Build, Lint, Typecheck, Test` → step `Typecheck (all workspaces)`
(`npm run typecheck`). `Compose — Config Validation` and
`Security — Audit & Secret Scan` both passed on that same run.

### Exact module-resolution symptoms
```
src/index.ts(11,37): error TS2307: Cannot find module '@dispatch/shared-types' or its corresponding type declarations.
src/index.ts(11,58): error TS2307: Cannot find module '@dispatch/shared-types' or its corresponding type declarations.
src/health/health.controller.ts(2,37): error TS2307: Cannot find module '@dispatch/shared-types' or its corresponding type declarations.
src/health/health.service.ts(2,37): error TS2307: Cannot find module '@dispatch/shared-types' or its corresponding type declarations.
src/app/page.tsx(1,32): error TS2307: Cannot find module '@dispatch/contracts' or its corresponding type declarations.
```
raised in `packages/contracts`, `packages/test-utils`, `apps/api`,
`apps/admin-web`, and `apps/mobile-pwa` — every workspace that imports a
sibling shared package (`@dispatch/shared-types` and/or
`@dispatch/contracts`), including a shared package (`@dispatch/contracts`)
importing another shared package (`@dispatch/shared-types`).

### Confirmed root cause
Confirmed against the actual repository, not assumed:
- `packages/shared-types|domain|validation|contracts|test-utils/package.json`
  each declare `"main": "./dist/index.js"` and `"types": "./dist/index.d.ts"`
  — TypeScript resolves the sibling-package import through those fields.
- `dist/` is listed in root `.gitignore` (`dist/` on line 21, plus
  `apps/api/dist/` on line 32) — it is never committed and does not exist
  on a fresh `git clone` + `npm ci`.
- `scripts/verify.sh` and `.github/workflows/ci.yml` both ran
  `npm run typecheck` (and `npm run test`) **before** `npm run build`, so
  on a clean checkout the compiled `dist/index.d.ts`/`dist/index.js` files
  that satisfy those imports had never been produced yet.
- Reproduced locally: after removing all locally-generated
  `packages/*/dist`, `apps/api/dist`, `apps/admin-web/.next`,
  `apps/mobile-pwa/.next`, and `*.tsbuildinfo` files (all confirmed
  git-ignored via `git check-ignore -v`) and running the bare root
  `npm run typecheck`, the exact same `TS2307` errors reproduced,
  workspace-for-workspace, against the CI log.
- Also reproduced for `npm run test`: Vitest failed with
  `Failed to resolve entry for package "@dispatch/contracts"` in both
  `apps/admin-web` and `apps/mobile-pwa` from the same artifact-free
  state, because Node/Vite module resolution needs the same `main`/`types`
  entry points at **runtime**, not only for type-checking. `npm run lint`
  was verified to **not** need `dist` (ESLint's `typescript-eslint`
  config here uses the non-type-checked `recommended` rule set with no
  import-resolution plugin, so it passed from the same clean state).

### Why local verification originally masked the defect
The macOS development machine that produced the original DEV-FOUNDATION-001
PASS had already run `npm run build` (and `next build`) multiple times
during iterative development, so `packages/*/dist`, `apps/api/dist`, and
`apps/*/.next` already existed on disk before `./scripts/verify.sh` was
ever run start-to-finish. `verify.sh`'s lint→typecheck→test→build ordering
therefore always found pre-existing compiled entry points for the shared
packages, even though the script itself never explicitly produced them
before typecheck/test. A GitHub Actions runner starts from a bare `git
clone` + `npm ci` with no such residue, which is what exposed the gap.
This is a genuine ordering defect in the verification scripts, not a
flaw in the original local PASS report — the original report was accurate
for the state it was run against.

### Files changed
- `package.json` — `typecheck` and `test` scripts now run
  `npm run build:packages` first (`&&`); `build` now calls `build:packages`
  instead of repeating its workspace list inline. `build:packages` itself
  (pre-existing) and `lint` are unchanged.
- `scripts/verify.sh` — added an explicit "Preparing shared workspace
  packages" step (`npm run build:packages`) between the workspace
  consistency check and lint, plus an updated header comment.
- `.github/workflows/ci.yml` — added a "Prepare shared workspace packages"
  step (`npm run build:packages`) in the `build-and-test` job, immediately
  after `npm ci` and before `Lint (all workspaces)`.

The implementation/configuration correction modified exactly three files: `package.json`, `scripts/verify.sh`, and `.github/workflows/ci.yml`. This CTO Summary is the fourth modified file because it records the post-push finding and correction. No `dist`/`.next` output is committed or intended for commit (still fully git-ignored).

### Corrected prerequisite ordering
1. `npm ci`
2. `npm run build:packages` (`packages/shared-types`, `packages/domain`,
   `packages/validation`, `packages/contracts`, `packages/test-utils`, in
   that order — `shared-types` first, since `contracts` and `test-utils`
   depend on it)
3. `npm run lint` (does not require step 2, but runs after it in both
   `verify.sh` and CI for a consistent, easy-to-read sequence)
4. `npm run typecheck` (self-prepares via `build:packages` even if invoked
   directly, not only through `verify.sh`/CI)
5. `npm run test` (same self-preparation, needed because Vitest/Jest
   resolve `@dispatch/*` imports at runtime, not only at type-check time)
6. `npm run build` (packages, then `apps/api`, `apps/admin-web`,
   `apps/mobile-pwa`)

The package list and build command live in exactly one place
(`build:packages`); `verify.sh` and CI both just invoke it, and
`typecheck`/`test` invoke it internally, so the ordering rule is not
duplicated as a separate list anywhere.

### Clean-room regression result
From an artifact-free state (`packages/*/dist`, `apps/api/dist`,
`apps/admin-web/.next`, `apps/mobile-pwa/.next`, and all `*.tsbuildinfo`
files removed — every path confirmed git-ignored/reproducible first via
`git check-ignore -v`, no source, config, `node_modules`, or Docker state
touched):
- **Before the fix**: `npm run lint` → PASS; `npm run typecheck` → FAIL
  (exact `TS2307` errors matching the CI log); `npm run test` → FAIL
  (Vitest `Failed to resolve entry for package "@dispatch/contracts"` in
  `apps/admin-web` and `apps/mobile-pwa`).
- **After the fix**, run in order from the same artifact-free state:
  `npm run lint` → **PASS**; `npm run typecheck` → **PASS** (self-prepares
  `packages/*/dist`, confirmed `shared-types` builds before `contracts`
  typechecks it); `npm run test` → **PASS** (all workspaces, including
  `apps/admin-web`/`apps/mobile-pwa` Vitest suites that previously failed
  to resolve `@dispatch/contracts`); `npm run build` → **PASS** (all 8
  workspaces, including both Next.js production builds).
- This confirms the fix is durable and represented in the scripted
  prerequisite ordering itself — Typecheck did not merely succeed because
  of a leftover full build from a prior manual step.

### Local verification result
`./scripts/verify.sh` → **PASS** (workspace consistency, prepare shared
packages, lint, typecheck, unit/foundation tests, build of all 8
workspaces, `docker compose config`), re-run after the clean-room
regression check, on top of the fix.
- `./scripts/api-smoke-test.sh` → **PASS**
- `./scripts/mobile-verify.sh` → **PASS**
- `./scripts/e2e-test.sh` → **PASS** (against the already-running stack;
  all 3 Playwright tests passed: Admin Web reachable/marker, Mobile/PWA
  reachable/marker, API health body)
- `npm ls --workspaces --all` → exit 0; only `UNMET OPTIONAL DEPENDENCY`
  entries, all expected platform-specific native-binary optionals (e.g.
  `@esbuild/*`, `@rollup/rollup-*`, `@tailwindcss/oxide-*`,
  `lightningcss-*`, `@img/sharp-*` for OS/arch combinations other than the
  current macOS arm64 host) — no non-optional unmet or invalid entries
- `npm ls typescript next @nestjs/core vitest` → `typescript@5.9.3`
  (overridden, deduped everywhere), `next@16.2.11`, `@nestjs/core@11.1.28`,
  `vitest@4.1.10` — no conflicting versions
- `bash -n` on all 9 `scripts/*.sh` → all syntactically valid
- `git status --short --untracked-files=all` → exactly four intended files modified: `package.json`, `scripts/verify.sh`, `.github/workflows/ci.yml`, and `docs/CTO_SUMMARY_DEV_FOUNDATION_001.md`; no untracked files
- `git diff --check` → clean (no trailing whitespace, no conflict markers)
- `package.json` parses as valid JSON; `.github/workflows/ci.yml` parses
  as valid YAML

### Security result
`./scripts/security-review.sh` → **PASS** (dependency audit: 0
HIGH/CRITICAL; secret scan: 0 findings; `docker compose config` valid; no
destructive Docker commands found in `scripts/*.sh`). No new dependency was
added by this fix — only script/workflow ordering changed.

### Docker status
The stack (`db`, `api`, `admin-web`, `mobile-pwa`) was already running at
the start of this task and was left running throughout — `db` and `api`
report Docker healthcheck status `healthy`; `admin-web` and `mobile-pwa`
were verified through HTTP reachability. No `docker compose down`, no
volume/container/image/network removal, and no other destructive Docker
command was run at any point.

### Remote GitHub Actions status
**NOT YET RUN.** This fix has not been pushed. The only remote run
evaluated is the prior failing run 29882143366; the corrected workflow's
outcome cannot be known or claimed until the user pushes and reports the
result.

### Non-blocking follow-up (recorded, not fixed here)
CI logs for `actions/checkout` and `actions/setup-node` carry a Node.js
action-runtime deprecation warning. This is unrelated to the Typecheck
failure investigated here (confirmed: the failure was a `TS2307` module
resolution error, not an actions-runtime error) and is out of scope for
this hotfix per the task instructions. Recorded as separate remaining
technical debt: a future task should bump `actions/checkout`/
`actions/setup-node` to their current major versions.

### Git scope
No Git mutation was performed — no `git add`, `git commit`, `git push`,
`git tag`, `git merge`, or history rewrite. Only read-only inspection
(`git status`, `git diff`, `git log`, `gh run view --log-failed`) was used.
All four changed files remain uncommitted, for the user to review and commit manually.

### Recommended commit message (DEV-FOUNDATION-001B)
```
fix(dispatch): prepare workspace packages before typecheck
```

## Remaining Work
Everything explicitly out of scope for this task remains undone, per the
Implementation Roadmap (Dispatch Knowledge Topic 11 §21): DEV-FOUNDATION-002
(Prisma schema, DB-connected API), AUTH-001 (JWT auth), and all MVP-02
onward business workflow (Delivery Task, Customer Master, Preparation,
Assignment, GPS check-in, Recipient, Evidence, Returned Goods, Reopen,
Emergency Override, Correction, Formal Investigation, Reporting).
Dependabot configuration and Docker-in-CI are deferred (see
`docs/SECURITY_HARNESS.md` § Future Security Enhancements).

## Next Step
DEV-FOUNDATION-002 — Database and API Foundation (initial Prisma schema for
Identity/Role, no business Commands) per Dispatch Knowledge Topic 11 §21.

## Recommended Commit Message
```
feat(dispatch): add repository and tooling foundation

Stand up the Dispatch npm-workspaces monorepo: NestJS API skeleton
(GET /health only), two Next.js foundation-status apps (admin-web,
mobile-pwa), PostgreSQL via Docker Compose (internal-only), harness
scripts mirroring the HR Management operating model, GitHub Actions CI,
and foundation documentation. No Dispatch business workflow is
implemented in this change.
```
