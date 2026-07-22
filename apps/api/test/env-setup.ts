/**
 * Deterministic test-only environment defaults (AUTH-001). Applied before
 * any test file imports auth modules, via each Jest config's `setupFiles`.
 * Not a production-like secret — 44 chars of fixed placeholder text, valid
 * only to satisfy the `loadAuthConfig` minimum-length check in tests.
 */
process.env.JWT_ACCESS_SECRET ??= "test-only-jwt-access-secret-not-a-real-secret-value";
process.env.JWT_ISSUER ??= "dispatch-api-test";
process.env.JWT_AUDIENCE ??= "dispatch-clients-test";
process.env.AUTH_COOKIE_SECURE ??= "false";
// Generous test-only limits — a single e2e-spec file legitimately calls
// /auth/login and /auth/refresh many more times than a real client would
// in the configured production window; throttling itself is covered by
// dedicated config-parsing unit tests (auth.config.spec.ts), not by
// exhausting the limit here.
process.env.AUTH_LOGIN_RATE_LIMIT ??= "1000:60";
process.env.AUTH_REFRESH_RATE_LIMIT ??= "1000:60";
