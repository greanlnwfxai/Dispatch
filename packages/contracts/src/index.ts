/**
 * Foundation-level API contracts shared between apps/api, apps/admin-web,
 * and apps/mobile-pwa.
 *
 * DEV-FOUNDATION-001 only introduces the health-check contract. Business
 * Command/Query contracts (CreateDeliveryTask, AssignDeliveryTask, ...) are
 * out of scope — see Dispatch Knowledge Topic 11 §17 for the future
 * command boundary this package will eventually expose.
 */

import type { HealthResponse, ReadinessResponse } from "@dispatch/shared-types";

export const HEALTH_ENDPOINT_PATH = "/health" as const;
export const HEALTH_LIVE_ENDPOINT_PATH = "/health/live" as const;
export const HEALTH_READY_ENDPOINT_PATH = "/health/ready" as const;

export function buildHealthUrl(apiBaseUrl: string): string {
  return `${apiBaseUrl.replace(/\/+$/, "")}${HEALTH_ENDPOINT_PATH}`;
}

export function isHealthResponse(value: unknown): value is HealthResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    (value as { status: unknown }).status === "ok" &&
    "service" in value &&
    typeof (value as { service: unknown }).service === "string"
  );
}

/**
 * DEV-FOUNDATION-002: GET /health mirrors GET /health/ready — both return
 * the database-aware readiness payload. GET /health/live stays DB-free and
 * matches `isHealthResponse` only (no `database` field).
 */
export function isReadinessResponse(value: unknown): value is ReadinessResponse {
  return (
    isHealthResponse(value) &&
    "database" in value &&
    (value as { database: unknown }).database === "ok"
  );
}

export type { HealthResponse, ReadinessResponse } from "@dispatch/shared-types";

/**
 * Authentication API contract (AUTH-001). Shapes only — no client
 * implementation. `refreshToken` deliberately never appears here: it is
 * carried only by an HttpOnly cookie, never in a JSON body (see
 * CLAUDE.md AUTH-001 boundary).
 */
import type { DispatchRoleCode } from "@dispatch/shared-types";

export const AUTH_LOGIN_PATH = "/auth/login" as const;
export const AUTH_REFRESH_PATH = "/auth/refresh" as const;
export const AUTH_LOGOUT_PATH = "/auth/logout" as const;
export const AUTH_LOGOUT_ALL_PATH = "/auth/logout-all" as const;
export const AUTH_ME_PATH = "/auth/me" as const;

export interface AuthPrincipal {
  userId: string;
  displayName: string;
  roleCodes: DispatchRoleCode[];
}

export interface LoginRequestBody {
  loginId: string;
  password: string;
}

export interface AccessTokenResponse {
  accessToken: string;
  accessTokenExpiresAt: string;
}

export interface LoginResponseBody extends AccessTokenResponse {
  principal: AuthPrincipal;
}

export function buildAuthUrl(apiBaseUrl: string, path: string): string {
  return `${apiBaseUrl.replace(/\/+$/, "")}${path}`;
}
