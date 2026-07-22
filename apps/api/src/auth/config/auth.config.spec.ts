import { loadAuthConfig, loadRateLimits } from "./auth.config";

const REQUIRED_ENV_VARS = [
  "JWT_ACCESS_SECRET",
  "JWT_ACCESS_TTL_SECONDS",
  "JWT_ISSUER",
  "JWT_AUDIENCE",
  "AUTH_REFRESH_TTL_SECONDS",
  "AUTH_SESSION_ABSOLUTE_TTL_SECONDS",
  "AUTH_COOKIE_NAME",
  "AUTH_COOKIE_SECURE",
  "AUTH_ALLOWED_ORIGINS",
  "AUTH_LOGIN_RATE_LIMIT",
  "AUTH_REFRESH_RATE_LIMIT",
];

describe("loadAuthConfig", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const key of REQUIRED_ENV_VARS) {
      delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it("throws when JWT_ACCESS_SECRET is missing — no weak production fallback", () => {
    delete process.env.JWT_ACCESS_SECRET;
    expect(() => loadAuthConfig()).toThrow(/JWT_ACCESS_SECRET/);
  });

  it("throws when JWT_ACCESS_SECRET is too short", () => {
    process.env.JWT_ACCESS_SECRET = "too-short";
    expect(() => loadAuthConfig()).toThrow(/at least/);
  });

  it("applies documented defaults when optional vars are absent", () => {
    process.env.JWT_ACCESS_SECRET = "a-sufficiently-long-test-only-secret-value";
    delete process.env.JWT_ACCESS_TTL_SECONDS;
    delete process.env.AUTH_ALLOWED_ORIGINS;
    delete process.env.AUTH_COOKIE_SECURE;

    const config = loadAuthConfig();
    expect(config.jwtAccessTtlSeconds).toBe(900);
    expect(config.allowedOrigins).toEqual(["http://localhost:6001", "http://localhost:6003"]);
    expect(config.cookieSecure).toBe(false);
  });

  it("parses AUTH_COOKIE_SECURE strictly (true/false only)", () => {
    process.env.JWT_ACCESS_SECRET = "a-sufficiently-long-test-only-secret-value";
    process.env.AUTH_COOKIE_SECURE = "yes";
    expect(() => loadAuthConfig()).toThrow(/"true" or "false"/);
  });

  it("parses AUTH_ALLOWED_ORIGINS as a comma-separated exact list", () => {
    process.env.JWT_ACCESS_SECRET = "a-sufficiently-long-test-only-secret-value";
    process.env.AUTH_ALLOWED_ORIGINS = "https://a.example.com, https://b.example.com";
    const config = loadAuthConfig();
    expect(config.allowedOrigins).toEqual(["https://a.example.com", "https://b.example.com"]);
  });

  it("rejects a malformed rate-limit value", () => {
    process.env.JWT_ACCESS_SECRET = "a-sufficiently-long-test-only-secret-value";
    process.env.AUTH_LOGIN_RATE_LIMIT = "not-a-rate-limit";
    expect(() => loadAuthConfig()).toThrow(/AUTH_LOGIN_RATE_LIMIT/);
  });

  it("parses a well-formed rate-limit value as limit:ttlSeconds", () => {
    process.env.JWT_ACCESS_SECRET = "a-sufficiently-long-test-only-secret-value";
    process.env.AUTH_LOGIN_RATE_LIMIT = "7:42";
    const config = loadAuthConfig();
    expect(config.loginRateLimit).toEqual({ limit: 7, ttlSeconds: 42 });
  });
});

describe("loadRateLimits", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    delete process.env.AUTH_LOGIN_RATE_LIMIT;
    delete process.env.AUTH_REFRESH_RATE_LIMIT;
    Object.assign(process.env, originalEnv);
  });

  it("does not require JWT_ACCESS_SECRET to be set", () => {
    delete process.env.JWT_ACCESS_SECRET;
    expect(() => loadRateLimits()).not.toThrow();
  });

  it("returns documented defaults when unset", () => {
    delete process.env.AUTH_LOGIN_RATE_LIMIT;
    delete process.env.AUTH_REFRESH_RATE_LIMIT;
    expect(loadRateLimits()).toEqual({
      login: { limit: 5, ttlSeconds: 60 },
      refresh: { limit: 30, ttlSeconds: 60 },
    });
  });
});
