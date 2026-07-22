/**
 * Authentication configuration (AUTH-001). Read once at module init time —
 * see AuthConfigModule. There is no weak production fallback for
 * `JWT_ACCESS_SECRET`: startup fails closed when it is absent or too short,
 * rather than silently running with a guessable default.
 */
export interface AuthConfig {
  jwtAccessSecret: string;
  jwtAccessTtlSeconds: number;
  jwtIssuer: string;
  jwtAudience: string;
  refreshTtlSeconds: number;
  sessionAbsoluteTtlSeconds: number;
  cookieName: string;
  cookieSecure: boolean;
  allowedOrigins: string[];
  loginRateLimit: { limit: number; ttlSeconds: number };
  refreshRateLimit: { limit: number; ttlSeconds: number };
  passwordMinLength: number;
  passwordMaxLength: number;
}

const MIN_SECRET_LENGTH = 32;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Auth configuration error: environment variable ${name} is required and must not be empty.`);
  }
  return value;
}

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim().length === 0) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Auth configuration error: environment variable ${name} must be a positive number.`);
  }
  return parsed;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim().length === 0) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`Auth configuration error: environment variable ${name} must be "true" or "false".`);
}

function readOrigins(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (raw === undefined || raw.trim().length === 0) {
    return fallback;
  }
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function readRateLimit(name: string, fallback: { limit: number; ttlSeconds: number }): {
  limit: number;
  ttlSeconds: number;
} {
  const raw = process.env[name];
  if (raw === undefined || raw.trim().length === 0) {
    return fallback;
  }
  const [limitRaw, ttlRaw] = raw.split(":");
  const limit = Number(limitRaw);
  const ttlSeconds = Number(ttlRaw);
  if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error(
      `Auth configuration error: environment variable ${name} must be in the form "<limit>:<ttlSeconds>" (e.g. "5:60").`,
    );
  }
  return { limit, ttlSeconds };
}

export interface RateLimitConfig {
  limit: number;
  ttlSeconds: number;
}

/**
 * Reads only the rate-limit env vars, without requiring `JWT_ACCESS_SECRET`.
 * `@Throttle()` decorator arguments must be literal values available at
 * class-body evaluation (module import) time, which can precede the point
 * where the full validated `AuthConfig` (via `loadAuthConfig`, resolved
 * through Nest DI) is available — so route decorators read rate limits
 * through this narrower, always-safe function instead.
 */
export function loadRateLimits(): { login: RateLimitConfig; refresh: RateLimitConfig } {
  return {
    login: readRateLimit("AUTH_LOGIN_RATE_LIMIT", { limit: 5, ttlSeconds: 60 }),
    refresh: readRateLimit("AUTH_REFRESH_RATE_LIMIT", { limit: 30, ttlSeconds: 60 }),
  };
}

export function loadAuthConfig(): AuthConfig {
  const jwtAccessSecret = requireEnv("JWT_ACCESS_SECRET");
  if (jwtAccessSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `Auth configuration error: JWT_ACCESS_SECRET must be at least ${MIN_SECRET_LENGTH} characters (high-entropy secret required).`,
    );
  }

  return {
    jwtAccessSecret,
    jwtAccessTtlSeconds: readNumber("JWT_ACCESS_TTL_SECONDS", 900),
    jwtIssuer: process.env.JWT_ISSUER?.trim() || "dispatch-api",
    jwtAudience: process.env.JWT_AUDIENCE?.trim() || "dispatch-clients",
    refreshTtlSeconds: readNumber("AUTH_REFRESH_TTL_SECONDS", 1_209_600),
    sessionAbsoluteTtlSeconds: readNumber("AUTH_SESSION_ABSOLUTE_TTL_SECONDS", 2_592_000),
    cookieName: process.env.AUTH_COOKIE_NAME?.trim() || "dispatch_refresh_token",
    cookieSecure: readBoolean("AUTH_COOKIE_SECURE", false),
    allowedOrigins: readOrigins("AUTH_ALLOWED_ORIGINS", [
      "http://localhost:6001",
      "http://localhost:6003",
    ]),
    loginRateLimit: readRateLimit("AUTH_LOGIN_RATE_LIMIT", { limit: 5, ttlSeconds: 60 }),
    refreshRateLimit: readRateLimit("AUTH_REFRESH_RATE_LIMIT", { limit: 30, ttlSeconds: 60 }),
    passwordMinLength: 12,
    passwordMaxLength: 128,
  };
}

export const AUTH_CONFIG = Symbol("AUTH_CONFIG");
