"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { AuthPrincipal } from "@dispatch/contracts";
import * as authClient from "../lib/auth-client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:6002";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: AuthStatus;
  principal: AuthPrincipal | null;
  login: (loginId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Authenticated fetch for MVP-02 business endpoints (Customer Master
   * search, Tasks). Attaches the in-memory access token, and on a single
   * 401 attempts one silent refresh + retry before giving up and moving
   * the session to `unauthenticated` — mirrors the one-shot bootstrap
   * refresh policy above, never a retry loop.
   */
  authFetch: (path: string, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Authentication session state for Admin Web (AUTH-001). The access token
 * is held only in a React ref (in-memory, never re-rendered directly, never
 * written to storage) — the refresh token never touches JavaScript at all,
 * since it lives exclusively in an HttpOnly cookie the browser manages.
 *
 * On mount, attempts exactly one silent refresh to restore a session left
 * over from a previous page load; it never retries automatically beyond
 * that single attempt, so a stale/absent session cannot cause a refresh
 * loop.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const accessTokenRef = useRef<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [principal, setPrincipal] = useState<AuthPrincipal | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const refreshed = await authClient.refresh();
      if (cancelled) return;
      if (!refreshed) {
        setStatus("unauthenticated");
        return;
      }
      accessTokenRef.current = refreshed.accessToken;
      const me = await authClient.fetchMe(refreshed.accessToken);
      if (cancelled) return;
      if (!me) {
        accessTokenRef.current = null;
        setStatus("unauthenticated");
        return;
      }
      setPrincipal(me);
      setStatus("authenticated");
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (loginId: string, password: string) => {
    const result = await authClient.login(loginId, password);
    accessTokenRef.current = result.accessToken;
    setPrincipal(result.principal);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    await authClient.logout();
    accessTokenRef.current = null;
    setPrincipal(null);
    setStatus("unauthenticated");
  }, []);

  const authFetch = useCallback(async (path: string, init: RequestInit = {}): Promise<Response> => {
    const attempt = (token: string | null) =>
      fetch(`${API_BASE_URL}${path}`, {
        ...init,
        credentials: "include",
        headers: {
          ...(init.headers ?? {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

    let response = await attempt(accessTokenRef.current);
    if (response.status === 401) {
      const refreshed = await authClient.refresh();
      if (!refreshed) {
        accessTokenRef.current = null;
        setPrincipal(null);
        setStatus("unauthenticated");
        return response;
      }
      accessTokenRef.current = refreshed.accessToken;
      response = await attempt(refreshed.accessToken);
    }
    return response;
  }, []);

  return (
    <AuthContext.Provider value={{ status, principal, login, logout, authFetch }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
