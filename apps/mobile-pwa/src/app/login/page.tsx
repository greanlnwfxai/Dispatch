"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../auth-context";

const GENERIC_ERROR = "Invalid loginId or password.";

export default function LoginPage() {
  const { status, login } = useAuth();
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(loginId, password);
      router.replace("/");
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">STEP-SOLUTIONS</p>
        <h1 className="mt-1 text-xl font-semibold">Dispatch Mobile/PWA — Sign in</h1>
      </div>

      <form className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1">
          <label htmlFor="loginId" className="text-sm font-medium text-slate-700">
            Login ID
          </label>
          <input
            id="loginId"
            name="loginId"
            type="text"
            autoComplete="username"
            required
            value={loginId}
            onChange={(event) => setLoginId(event.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-base"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-base"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-slate-900 px-4 py-2 text-base font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
