import { buildHealthUrl } from "@dispatch/contracts";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:6002";

export default function HomePage() {
  const healthUrl = buildHealthUrl(API_BASE_URL);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          STEP-SOLUTIONS
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Dispatch Mobile/PWA</h1>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <dl className="grid gap-4">
          <div>
            <dt className="text-sm font-medium text-slate-500">Foundation status</dt>
            <dd className="mt-1 text-base">
              DEV-FOUNDATION-001 — repository and tooling foundation. No delivery workflow,
              GPS check-in, or evidence capture is implemented yet.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-slate-500">Backend health URL</dt>
            <dd className="mt-1 font-mono text-sm break-all">
              <a className="text-blue-600 underline" href={healthUrl}>
                {healthUrl}
              </a>
            </dd>
          </div>
        </dl>
      </div>
    </main>
  );
}
