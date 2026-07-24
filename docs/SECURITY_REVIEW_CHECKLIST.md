# Security Review Checklist

Use this checklist when reviewing a task for security impact. Each task's
CTO Summary must include a Security Review section (see `CLAUDE.md`).

Mark each item: ✅ PASS | ❌ FAIL | N/A | ⚠️ REVIEW

Items below marked with a milestone tag (e.g. "AUTH-001") reflect the
milestone that introduced the behavior. Business-data-model items became
applicable starting MVP-02; GPS/camera/handover-evidence-capture items
remain N/A until their approved milestone (MVP-05 onward — MVP-04 ends at
`ASSIGNED`, before Delivery Start).

---

## Authentication (AUTH-001)

- [x] All new/changed endpoints have an auth guard applied — `JwtAuthenticationGuard` is global (`APP_GUARD`); routes opt out explicitly via `@Public()`
- [x] Login (`POST /auth/login`), refresh (`POST /auth/refresh`), logout, logout-all, and `GET /auth/me` implemented (AUTH-001)
- [x] `/health*` remain intentionally unauthenticated (`@Public()`, required for Docker healthchecks) and documented as such
- [x] No authentication bypass possible via header manipulation — access token is verified (signature/issuer/audience/expiry) and the session/user/roles are re-resolved from PostgreSQL on every request, never trusted from the JWT payload alone

## Authorization / RBAC (AUTH-001)

- [x] Role checks applied via `RolesGuard` + `@Roles(...)`, resolved from the database-loaded principal, never from client-supplied or JWT-claimed role data
- [x] No privilege escalation possible via crafted request payloads — RBAC e2e test confirms 403 for an insufficient role and 401 with no token
- [x] All six approved role codes (`@dispatch/shared-types`) are the only ones `RolesGuard`/`JwtAuthenticationGuard` will ever accept — unknown codes are filtered out when resolving the principal

## Password / Token / Hash Security (AUTH-001)

- [x] Passwords are hashed with Argon2id (`@node-rs/argon2`), never stored plain
- [x] No plain-text password, refresh token, or access token appears in any log output (`PrismaService` logs only `error`/`warn`, never `query`)
- [x] `JWT_ACCESS_SECRET` is read from environment variable, never hardcoded, no weak production fallback (startup fails closed if absent/too short)
- [x] Access tokens are short-lived (15 min default); refresh tokens rotate on every use; revocation is server-side (`AuthSession.revokedAt`) — reuse of a used/revoked refresh token revokes the session immediately
- [x] No token is ever stored in browser `localStorage`/`sessionStorage`/IndexedDB on any client — refresh token lives only in an HttpOnly cookie; access token is held in memory only

## Data Privacy (applicable since MVP-02)

- [x] No PII is exposed in any endpoint response beyond what each role's approved record scope requires — `GET /assignment-candidates` returns only `{userId, displayName, activeTaskCount}` (MVP-04); `GET /auth/me` returns only `userId`/`displayName`/`roleCodes` (AUTH-001)
- [x] Pagination results are bounded to prevent full data dumps — every list endpoint (`/tasks`, `/assignment-candidates`, `/assigned-tasks`, `/preparation-corrections`) enforces `page`/`pageSize` with a server-side maximum
- [x] Personal data is not logged in debug/error output — `PrismaService` logs only `error`/`warn`, never `query` (unchanged since AUTH-001)
- [x] `GET /auth/me` returns only `userId`/`displayName`/`roleCodes` — never `loginId`, `passwordHash`, session/token internals (AUTH-001)

## Mobile Security (AUTH-001 + MVP-04 read-only record scope)

- [x] `NEXT_PUBLIC_*` variables contain no secrets (they are bundled into the browser bundle)
- [ ] API base URL uses HTTPS in production builds — deferred to production deployment milestone (local dev is HTTP by design)
- [x] No sensitive data stored in unencrypted client-side storage — verified by unit tests asserting `localStorage.length === 0`/`sessionStorage.length === 0` after authenticated bootstrap
- [x] Refresh token uses secure, non-`localStorage` storage (HttpOnly cookie) on both Admin Web and Mobile/PWA; no service worker exists in this repository to cache auth responses
- [x] Record scope enforced server-side, not merely UI-hidden — `GET /assigned-tasks`/`GET /assigned-tasks/:id` return only the caller's own current-primary-assignee tasks; a supporting-only or unrelated employee gets `404` (MVP-04)
- [N/A] GPS check-in, camera/evidence capture — not implemented until MVP-05 onward (MVP-04 ends at `ASSIGNED`, before Delivery Start)

## API Input Validation (applicable since MVP-02)

- [x] All new DTOs use `class-validator` decorators — `AssignTaskDto`/`ReassignTaskDto`/`ListAssignmentCandidatesQueryDto`/`ListAssignedTasksQueryDto` (MVP-04) follow the same pattern as `CreateDeliveryTaskDto`/`UpdatePreparationDto`
- [x] Global `ValidationPipe` has `whitelist: true, transform: true, forbidNonWhitelisted: true` (unchanged since AUTH-001) — rejects unknown properties on every endpoint, including MVP-04's
- [x] Pagination parameters validated and bounded — `page`/`pageSize` are `@IsInt()` + `@Min`/`@Max`-bounded on every list endpoint

## Logging / Error Handling

- [x] `GET /health` returns a deterministic, minimal body — no stack traces, no secrets
- [x] Production error responses return generic messages (no stack traces) — verified for MVP-02/03/04 endpoints via e2e assertions that response bodies never match `stack|prisma|postgres`
- [x] Failed authentication attempts return a generic 401 (AUTH-001, unchanged)

## Secrets / Environment

- [x] No secrets hardcoded in source files
- [x] `.env` is in `.gitignore` and NOT tracked by git
- [x] `.env.example` uses only placeholder values
- [x] Docker Compose uses environment variable references, not hardcoded credentials
- [x] `scripts/secret-scan.sh` exits 0

## Dependency Vulnerabilities

- [x] `scripts/security-audit.sh` exits 0 (no HIGH or CRITICAL vulnerabilities)
- [x] New packages added in this task have been reviewed (NestJS/Next/Vitest bumped to current majors specifically to clear known advisories)
- [ ] Any MODERATE vulnerabilities are documented and scheduled for resolution — none outstanding as of DEV-FOUNDATION-001

## Docker / Deployment

- [x] No destructive Docker commands used without explicit user approval
- [x] Database credentials in Docker Compose come from environment variables (`POSTGRES_PASSWORD` is a required, non-defaulted variable)
- [x] PostgreSQL is not exposed on a host port by default
- [x] API/Web/Mobile containers run as a non-root user
- [x] Healthcheck endpoints (`/health`) do not expose sensitive system information

## CI / GitHub Actions

- [x] No secrets hardcoded in workflow `.yml` files
- [x] CI uses safe placeholder values for `docker compose config` validation
- [x] Security audit + secret scan job present and blocking in CI
- [ ] Dependabot configured — deferred (see `docs/SECURITY_HARNESS.md` § Future Security Enhancements)
