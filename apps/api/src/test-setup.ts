/**
 * Deterministic test-only environment defaults (AUTH-001), for the unit
 * (`*.spec.ts`) Jest config only — see `apps/api/test/env-setup.ts` for the
 * equivalent used by the e2e/integration configs. Deliberately duplicated
 * rather than imported from `../test/env-setup`: importing a file outside
 * `src/` from here would pull it into `nest build`'s TypeScript program and
 * shift its inferred output root (`dist/main.js` becomes `dist/src/main.js`),
 * breaking the Docker image's `CMD ["node", "dist/main.js"]`. This file
 * must stay self-contained within `src/`.
 */
process.env.JWT_ACCESS_SECRET ??= "test-only-jwt-access-secret-not-a-real-secret-value";
process.env.JWT_ISSUER ??= "dispatch-api-test";
process.env.JWT_AUDIENCE ??= "dispatch-clients-test";
process.env.AUTH_COOKIE_SECURE ??= "false";
process.env.AUTH_LOGIN_RATE_LIMIT ??= "1000:60";
process.env.AUTH_REFRESH_RATE_LIMIT ??= "1000:60";
