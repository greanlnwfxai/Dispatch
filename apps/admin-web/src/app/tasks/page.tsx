"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DeliveryTaskSummaryDto } from "@dispatch/contracts";
import { useAuth } from "../auth-context";
import { listDeliveryTasks, TasksApiError } from "../../lib/tasks-client";
import { canCreateEditSubmitTasks } from "./_components/roles";

const PAGE_SIZE = 20;

/** Task list (§9). Read access: SUPER_ADMIN/ADMIN/DISPATCHER/STOCK/MANAGEMENT_AUDITOR (enforced server-side). */
export default function TasksListPage() {
  const { status, principal, authFetch } = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState<DeliveryTaskSummaryDto[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  async function goToPage(targetPage: number) {
    setError(null);
    try {
      const result = await listDeliveryTasks(authFetch, { page: targetPage, pageSize: PAGE_SIZE });
      setTasks(result.items);
      setTotal(result.total);
      setPage(targetPage);
    } catch (err) {
      setTasks([]);
      setError(err instanceof TasksApiError ? err.message : "โหลดรายการงานไม่สำเร็จ");
    }
  }

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
        const result = await listDeliveryTasks(authFetch, { page: 1, pageSize: PAGE_SIZE });
        if (cancelled) return;
        setTasks(result.items);
        setTotal(result.total);
        setPage(1);
      } catch (err) {
        if (cancelled) return;
        setTasks([]);
        setError(err instanceof TasksApiError ? err.message : "โหลดรายการงานไม่สำเร็จ");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- authFetch is stable per AuthProvider render; re-running on every render would refetch in a loop.
  }, [status, router]);

  if (status === "loading" || (status === "authenticated" && tasks === null && !error)) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-sm text-slate-500">กำลังโหลด…</p>
      </main>
    );
  }

  if (status !== "authenticated" || !principal) {
    return null;
  }

  const canCreate = canCreateEditSubmitTasks(principal.roleCodes);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">งานจัดส่ง (Delivery Tasks)</h1>
        {canCreate && (
          <Link href="/tasks/new" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            + สร้างงานใหม่
          </Link>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {tasks && tasks.length === 0 && !error && <p className="text-sm text-slate-500">ยังไม่มีงาน</p>}

      {tasks && tasks.length > 0 && (
        <div className="overflow-x-auto rounded border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">เลขที่งาน</th>
                <th className="px-4 py-2">สถานะ</th>
                <th className="px-4 py-2">วันที่วางแผนจัดส่ง</th>
                <th className="px-4 py-2">ลูกค้า</th>
                <th className="px-4 py-2">ปลายทาง</th>
                <th className="px-4 py-2">แหล่งที่มา</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className="border-t border-slate-200">
                  <td className="px-4 py-2">
                    <Link href={`/tasks/${task.id}`} className="font-medium text-slate-900 underline">
                      {task.taskNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{task.status}</td>
                  <td className="px-4 py-2">{task.plannedDeliveryDate ?? "—"}</td>
                  <td className="px-4 py-2">{task.customerName}</td>
                  <td className="px-4 py-2">{task.destinationName}</td>
                  <td className="px-4 py-2">{task.destinationSource}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center gap-3 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => void goToPage(page - 1)}
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
          >
            ก่อนหน้า
          </button>
          <span>
            หน้า {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => void goToPage(page + 1)}
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
          >
            ถัดไป
          </button>
        </div>
      )}
    </main>
  );
}
