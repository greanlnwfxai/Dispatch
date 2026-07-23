"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { DeliveryTaskDetailDto } from "@dispatch/contracts";
import { useAuth } from "../../auth-context";
import { getDeliveryTask, submitDeliveryTask, TasksApiError } from "../../../lib/tasks-client";
import { canCreateEditSubmitTasks } from "../_components/roles";

/** Task detail (§9). Displays the frozen Historical Destination Snapshot, not a live Master join. No delete action ever exists. */
export default function TaskDetailPage() {
  const { status, principal, authFetch } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const taskId = params.id;

  const [task, setTask] = useState<DeliveryTaskDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status !== "authenticated") {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await getDeliveryTask(authFetch, taskId);
        if (cancelled) return;
        setTask(result);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof TasksApiError ? err.message : "ไม่พบงานที่ต้องการ");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- authFetch is stable per AuthProvider render; re-running on every render would refetch in a loop.
  }, [status, router, taskId]);

  if (status === "loading" || (status === "authenticated" && !task && !error)) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm text-slate-500">กำลังโหลด…</p>
      </main>
    );
  }
  if (status !== "authenticated" || !principal) {
    return null;
  }
  if (error || !task) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p role="alert" className="text-sm text-red-600">
          {error ?? "ไม่พบงานที่ต้องการ"}
        </p>
      </main>
    );
  }

  const canManage = canCreateEditSubmitTasks(principal.roleCodes);
  const isDraft = task.status === "DRAFT";

  async function handleSubmit() {
    if (!window.confirm("ยืนยันการส่งงานเข้าสู่ขั้นตอนรอจัดเตรียมสินค้า (WAITING_PREPARATION)? การดำเนินการนี้ไม่สามารถย้อนกลับได้")) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const updated = await submitDeliveryTask(authFetch, task!.id);
      setTask(updated);
    } catch (err) {
      setError(err instanceof TasksApiError ? err.message : "ส่งงานไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{task.taskNumber}</h1>
          <p className="text-sm text-slate-500">สถานะ: {task.status}</p>
        </div>
        {canManage && isDraft && (
          <div className="flex gap-2">
            <Link href={`/tasks/${task.id}/edit`} className="rounded border border-slate-300 px-4 py-2 text-sm">
              แก้ไข
            </Link>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleSubmit()}
              className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? "กำลังส่ง…" : "ส่งงาน (Submit)"}
            </button>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <section className="rounded border border-slate-200 p-4">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">ปลายทาง (Historical Snapshot)</h2>
        <dl className="grid gap-1 text-sm">
          <div>
            <dt className="inline text-slate-500">แหล่งที่มา: </dt>
            <dd className="inline">{task.destinationSource}</dd>
          </div>
          <div>
            <dt className="inline text-slate-500">ลูกค้า: </dt>
            <dd className="inline">{task.customerName}</dd>
          </div>
          <div>
            <dt className="inline text-slate-500">ปลายทาง: </dt>
            <dd className="inline">{task.destinationName}</dd>
          </div>
          <div>
            <dt className="inline text-slate-500">ที่อยู่: </dt>
            <dd className="inline">{task.address}</dd>
          </div>
          {task.contactName && (
            <div>
              <dt className="inline text-slate-500">ผู้ติดต่อ: </dt>
              <dd className="inline">{task.contactName}</dd>
            </div>
          )}
          <div>
            <dt className="inline text-slate-500">วันที่วางแผนจัดส่ง: </dt>
            <dd className="inline">{task.plannedDeliveryDate ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded border border-slate-200 p-4">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">รายการสินค้า</h2>
        {task.items.length === 0 ? (
          <p className="text-sm text-slate-500">ไม่มีรายการสินค้า</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1">รายการ</th>
                <th className="py-1">จำนวน</th>
                <th className="py-1">หน่วย</th>
              </tr>
            </thead>
            <tbody>
              {task.items.map((item) => (
                <tr key={item.lineNumber} className="border-t border-slate-100">
                  <td className="py-1">{item.description}</td>
                  <td className="py-1">{item.plannedQuantity}</td>
                  <td className="py-1">{item.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {task.references.length > 0 && (
        <section className="rounded border border-slate-200 p-4">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">เอกสารอ้างอิง</h2>
          <ul className="text-sm">
            {task.references.map((reference, index) => (
              <li key={index}>
                {reference.referenceType}: {reference.referenceValue}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded border border-slate-200 p-4">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">ประวัติสถานะ</h2>
        <ul className="text-sm">
          {task.events.map((event, index) => (
            <li key={index}>
              {event.occurredAt} — {event.eventType} ({event.previousStatus ?? "—"} → {event.newStatus})
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
