"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-context";

/**
 * Authenticated home (AUTH-001 shell + MVP-04 entry point). Internal
 * Delivery Employees get a link to their read-only "My Assigned Tasks"
 * view; no delivery workflow, GPS check-in, or evidence capture exists yet.
 * Unauthenticated visitors are redirected to /login. An "offline" bootstrap
 * failure (network error, not a rejected session) shows a distinct
 * retry-safe message rather than silently redirecting to login.
 */
export default function HomePage() {
  const { status, principal, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
        <p className="text-sm text-slate-500">Loading…</p>
      </main>
    );
  }

  if (status === "offline") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
        <p className="text-sm text-slate-500">
          Unable to reach the server. Check your connection and reload the app.
        </p>
      </main>
    );
  }

  if (status !== "authenticated" || !principal) {
    return null;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">STEP-SOLUTIONS</p>
        <h1 className="mt-1 text-2xl font-semibold">Dispatch Mobile/PWA</h1>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <dl className="grid gap-4">
          <div>
            <dt className="text-sm font-medium text-slate-500">Signed in as</dt>
            <dd className="mt-1 text-base">{principal.displayName}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-slate-500">Role codes</dt>
            <dd className="mt-1 text-base">{principal.roleCodes.join(", ") || "(none assigned)"}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-slate-500">Foundation status</dt>
            <dd className="mt-1 text-base">
              MVP-04 — assignment record scope. No delivery workflow, GPS check-in, or evidence capture is
              implemented yet.
            </dd>
          </div>
        </dl>
      </div>

      {principal.roleCodes.includes("INTERNAL_DELIVERY_EMPLOYEE") && (
        <Link
          href="/assigned-tasks"
          className="rounded-lg border border-slate-200 bg-white p-4 text-sm font-medium shadow-sm"
        >
          My Assigned Tasks →
        </Link>
      )}

      <button
        type="button"
        onClick={() => void logout()}
        className="self-start rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
      >
        Sign out
      </button>
    </main>
  );
}
