"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AssignedTaskSummaryDto } from "@dispatch/contracts";
import { useAuth } from "../auth-context";
import { AssignedTasksApiError, listMyAssignedTasks } from "../../lib/assignment-client";

/**
 * MVP-04 — read-only "My assigned tasks" list for INTERNAL_DELIVERY_EMPLOYEE.
 * Shows only tasks where the signed-in user is the current primary
 * assignee (enforced server-side by GET /assigned-tasks — a supporting-only
 * employee never sees a task here). No start-delivery, GPS, evidence,
 * recipient, signature, closure, or return action is exposed anywhere in
 * Mobile/PWA yet.
 */
export default function AssignedTasksPage() {
  const { status, principal, authFetch } = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState<AssignedTaskSummaryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status !== "authenticated" || !principal) return;
    // Client-side role gate is UI-only, never authoritative — the server
    // rejects a non-INTERNAL_DELIVERY_EMPLOYEE caller regardless — but
    // skipping the fetch here avoids a doomed request.
    if (!principal.roleCodes.includes("INTERNAL_DELIVERY_EMPLOYEE")) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await listMyAssignedTasks(authFetch);
        if (!cancelled) setTasks(result.items);
      } catch (err) {
        if (!cancelled) setError(err instanceof AssignedTasksApiError ? err.message : "Failed to load your assigned tasks.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- authFetch is stable per AuthProvider render.
  }, [status, router, principal]);

  const isDeliveryEmployee = principal?.roleCodes.includes("INTERNAL_DELIVERY_EMPLOYEE") ?? false;

  if (status === "loading" || (status === "authenticated" && isDeliveryEmployee && tasks === null && !error)) {
    return (
      <main className="mx-auto max-w-md px-6 py-12">
        <p className="text-sm text-slate-500">Loading…</p>
      </main>
    );
  }
  if (status === "offline") {
    return (
      <main className="mx-auto max-w-md px-6 py-12">
        <p className="text-sm text-slate-500">Unable to reach the server. Check your connection and reload the app.</p>
      </main>
    );
  }
  if (status !== "authenticated" || !principal) return null;

  if (!isDeliveryEmployee) {
    return (
      <main className="mx-auto max-w-md px-6 py-12">
        <Link href="/" className="text-sm text-slate-500">
          ← Home
        </Link>
        <p className="mt-4 text-sm text-slate-500">This view is only available to Internal Delivery Employees.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-12">
      <div>
        <Link href="/" className="text-sm text-slate-500">
          ← Home
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">My Assigned Tasks</h1>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {tasks && tasks.length === 0 && <p className="text-sm text-slate-500">You have no assigned tasks right now.</p>}

      {tasks && tasks.length > 0 && (
        <ul className="flex flex-col gap-3">
          {tasks.map((task) => (
            <li key={task.id}>
              <Link href={`/assigned-tasks/${task.id}`} className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-medium">{task.taskNumber}</p>
                <p className="text-sm text-slate-500">{task.destinationName}</p>
                <p className="text-xs text-slate-400">
                  {task.status} · Planned: {task.plannedDeliveryDate ?? "-"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
