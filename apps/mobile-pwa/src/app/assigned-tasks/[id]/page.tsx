"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { AssignedTaskDetailDto } from "@dispatch/contracts";
import { useAuth } from "../../auth-context";
import { AssignedTasksApiError, getMyAssignedTaskDetail } from "../../../lib/assignment-client";

/**
 * MVP-04 — read-only assigned-task detail for INTERNAL_DELIVERY_EMPLOYEE.
 * Record scope is enforced entirely server-side by GET /assigned-tasks/:id
 * (a supporting-only or unrelated employee gets 404 here, never task data,
 * whether reached via this page or a direct URL/API call). No
 * start-delivery, GPS, evidence, recipient, signature, closure, or return
 * action exists — MVP-04 ends at ASSIGNED.
 */
export default function AssignedTaskDetailPage() {
  const { status, principal, authFetch } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const taskId = params.id;

  const [task, setTask] = useState<AssignedTaskDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status !== "authenticated") return;
    let cancelled = false;
    (async () => {
      try {
        const result = await getMyAssignedTaskDetail(authFetch, taskId);
        if (!cancelled) setTask(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof AssignedTasksApiError ? err.message : "Assigned task not found.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- authFetch is stable per AuthProvider render.
  }, [status, router, taskId]);

  if (status === "loading" || (status === "authenticated" && !task && !error)) {
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
  if (error && !task) {
    return (
      <main className="mx-auto max-w-md px-6 py-12">
        <Link href="/assigned-tasks" className="text-sm text-slate-500">
          ← My Assigned Tasks
        </Link>
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      </main>
    );
  }
  if (!task) return null;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-12">
      <div>
        <Link href="/assigned-tasks" className="text-sm text-slate-500">
          ← My Assigned Tasks
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{task.taskNumber}</h1>
        <p className="text-sm text-slate-500">{task.status}</p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="font-medium text-slate-500">Destination</dt>
            <dd className="mt-1">{task.destinationName}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Address</dt>
            <dd className="mt-1">{task.address}</dd>
          </div>
          {task.contactName && (
            <div>
              <dt className="font-medium text-slate-500">Contact</dt>
              <dd className="mt-1">
                {task.contactName}
                {task.contactPhone ? ` · ${task.contactPhone}` : ""}
              </dd>
            </div>
          )}
          {task.deliveryInstructions && (
            <div>
              <dt className="font-medium text-slate-500">Delivery Instructions</dt>
              <dd className="mt-1">{task.deliveryInstructions}</dd>
            </div>
          )}
          {task.locationReference && (
            <div>
              <dt className="font-medium text-slate-500">Location Reference</dt>
              <dd className="mt-1">{task.locationReference}</dd>
            </div>
          )}
          {task.accessNotes && (
            <div>
              <dt className="font-medium text-slate-500">Access Notes</dt>
              <dd className="mt-1">{task.accessNotes}</dd>
            </div>
          )}
          <div>
            <dt className="font-medium text-slate-500">Planned Delivery Date</dt>
            <dd className="mt-1">{task.plannedDeliveryDate ?? "-"}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Preparation</dt>
            <dd className="mt-1">{task.preparationReady ? "Ready" : "Not yet confirmed ready"}</dd>
          </div>
          {task.supportingEmployees.length > 0 && (
            <div>
              <dt className="font-medium text-slate-500">Supporting Employees (informational only)</dt>
              <dd className="mt-1">{task.supportingEmployees.map((support) => support.displayName).join(", ")}</dd>
            </div>
          )}
        </dl>
      </div>
    </main>
  );
}
