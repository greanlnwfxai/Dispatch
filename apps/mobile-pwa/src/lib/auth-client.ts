import {
  AUTH_LOGIN_PATH,
  AUTH_LOGOUT_ALL_PATH,
  AUTH_LOGOUT_PATH,
  AUTH_ME_PATH,
  AUTH_REFRESH_PATH,
  buildAuthUrl,
  type AccessTokenResponse,
  type AuthPrincipal,
  type LoginResponseBody,
} from "@dispatch/contracts";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:6002";

/**
 * Thin fetch wrapper for the AUTH-001 endpoints (Mobile/PWA). The access
 * token is returned to the caller to hold in memory only — this module
 * never reads or writes localStorage/sessionStorage/IndexedDB, and there is
 * no service worker in this app to cache these responses. The refresh
 * token is never handled here: it lives only in the HttpOnly
 * `dispatch_refresh_token` cookie, attached automatically via
 * `credentials: "include"`.
 */

export class AuthApiError extends Error {}

async function parseJsonOrThrow<T>(response: Response, genericMessage: string): Promise<T> {
  if (!response.ok) {
    throw new AuthApiError(genericMessage);
  }
  return (await response.json()) as T;
}

export async function login(loginId: string, password: string): Promise<LoginResponseBody> {
  const response = await fetch(buildAuthUrl(API_BASE_URL, AUTH_LOGIN_PATH), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({ loginId, password }),
  });
  return parseJsonOrThrow<LoginResponseBody>(response, "Invalid loginId or password.");
}

export async function refresh(): Promise<AccessTokenResponse | null> {
  const response = await fetch(buildAuthUrl(API_BASE_URL, AUTH_REFRESH_PATH), {
    method: "POST",
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as AccessTokenResponse;
}

export async function fetchMe(accessToken: string): Promise<AuthPrincipal | null> {
  const response = await fetch(buildAuthUrl(API_BASE_URL, AUTH_ME_PATH), {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as AuthPrincipal;
}

export async function logout(): Promise<void> {
  await fetch(buildAuthUrl(API_BASE_URL, AUTH_LOGOUT_PATH), {
    method: "POST",
    credentials: "include",
    cache: "no-store",
  });
}

export async function logoutAll(accessToken: string): Promise<void> {
  await fetch(buildAuthUrl(API_BASE_URL, AUTH_LOGOUT_ALL_PATH), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
    cache: "no-store",
  });
}
