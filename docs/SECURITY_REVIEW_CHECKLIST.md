# Security Review Checklist

Use this checklist when reviewing a task for security impact. Each task's
CTO Summary must include a Security Review section (see `CLAUDE.md`).

Mark each item: ✅ PASS | ❌ FAIL | N/A | ⚠️ REVIEW

Items below marked with a milestone tag (e.g. "AUTH-001") reflect the
milestone that introduced the behavior. Business-data-model and
GPS/camera/evidence items remain N/A until the milestones that introduce
them (MVP-02 onward).

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

## Data Privacy (N/A until business data models exist)

- [ ] No PII is exposed in any endpoint response
- [ ] Pagination results are bounded to prevent full data dumps
- [ ] Personal data is not logged in debug/error output
- [x] `GET /auth/me` returns only `userId`/`displayName`/`roleCodes` — never `loginId`, `passwordHash`, session/token internals (AUTH-001)

## Mobile Security (AUTH-001 partial — GPS/camera/evidence remain N/A)

- [x] `NEXT_PUBLIC_*` variables contain no secrets (they are bundled into the browser bundle)
- [ ] API base URL uses HTTPS in production builds — deferred to production deployment milestone (local dev is HTTP by design)
- [x] No sensitive data stored in unencrypted client-side storage — verified by unit tests asserting `localStorage.length === 0`/`sessionStorage.length === 0` after authenticated bootstrap
- [x] Refresh token uses secure, non-`localStorage` storage (HttpOnly cookie) on both Admin Web and Mobile/PWA; no service worker exists in this repository to cache auth responses

## API Input Validation (N/A — no business endpoints yet)

- [ ] All new DTOs use `class-validator` decorators
- [ ] Global `ValidationPipe` has `whitelist: true, transform: true`
- [ ] Pagination parameters validated and bounded

## Logging / Error Handling

- [x] `GET /health` returns a deterministic, minimal body — no stack traces, no secrets
- [ ] Production error responses return generic messages (no stack traces) — apply when business endpoints are added
- [ ] Failed authentication attempts are logged (once AUTH-001 exists)

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
