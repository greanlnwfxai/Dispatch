"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-context";

/**
 * Authenticated placeholder (AUTH-001) — no business dashboard, no
 * role-management UI. Unauthenticated visitors are redirected to /login;
 * the redirect happens client-side after the one-shot session bootstrap
 * (see AuthProvider) resolves, so there is no server-rendered flash of
 * protected content.
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
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-12">
        <p className="text-sm text-slate-500">Loading…</p>
      </main>
    );
  }

  if (status !== "authenticated" || !principal) {
    return null;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-12">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">STEP-SOLUTIONS</p>
        <h1 className="mt-1 text-3xl font-semibold">Dispatch Admin Web</h1>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
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
            <dt className="text-sm font-medium text-slate-500">Milestone</dt>
            <dd className="mt-1 text-base">MVP-02 — Customer and Task Creation</dd>
          </div>
        </dl>
      </div>

      <Link
        href="/tasks"
        className="self-start rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white"
      >
        งานจัดส่ง (Delivery Tasks)
      </Link>

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
