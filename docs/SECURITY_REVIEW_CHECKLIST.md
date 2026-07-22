# Security Review Checklist

Use this checklist when reviewing a task for security impact. Each task's
CTO Summary must include a Security Review section (see `CLAUDE.md`).

Mark each item: ✅ PASS | ❌ FAIL | N/A | ⚠️ REVIEW

Most items below are **N/A in DEV-FOUNDATION-001** because no authentication,
RBAC, or business data-handling code exists yet. Do not mark them PASS just
because nothing broke — mark them N/A with the reason, and revisit at the
milestone that actually introduces the behavior (AUTH-001, MVP-02, ...).

---

## Authentication (N/A until AUTH-001)

- [ ] All new/changed endpoints have an auth guard applied
- [ ] No login endpoint exists yet in this milestone
- [ ] `/health` is intentionally unauthenticated (required for Docker healthchecks) and documented as such
- [ ] No authentication bypass possible via header manipulation

## Authorization / RBAC (N/A until AUTH-001 / role-aware modules)

- [ ] Role checks applied to endpoints that require elevated privileges
- [ ] No privilege escalation possible via crafted request payloads
- [ ] New roles (if added) are reflected in all relevant guards

## Password / Token / Hash Security (N/A until AUTH-001)

- [ ] Passwords are hashed with a strong algorithm (bcrypt/argon2), never stored plain
- [ ] No plain-text password or token appears in any log output
- [ ] `JWT_SECRET` (when introduced) is read from environment variable, never hardcoded
- [ ] Access tokens are short-lived; refresh tokens rotate; revocation is server-side (Topic 11 §5.7 PO-authorized direction)
- [ ] No token is ever stored in browser `localStorage` on any client

## Data Privacy (N/A until business data models exist)

- [ ] No PII is exposed in any endpoint response
- [ ] Pagination results are bounded to prevent full data dumps
- [ ] Personal data is not logged in debug/error output

## Mobile Security (N/A until GPS/camera/evidence features exist)

- [ ] `NEXT_PUBLIC_*` variables contain no secrets (they are bundled into the browser bundle)
- [ ] API base URL uses HTTPS in production builds
- [ ] No sensitive data stored in unencrypted client-side storage
- [ ] Tokens (when introduced) use secure, non-`localStorage` storage on mobile/PWA

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
