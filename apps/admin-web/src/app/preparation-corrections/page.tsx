"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ListPreparationCorrectionsResponseBody } from "@dispatch/contracts";
import { useAuth } from "../auth-context";
import { listPreparationCorrections, reviewPreparationCorrection, TasksApiError } from "../../lib/tasks-client";
import { canReviewPreparationCorrection } from "../tasks/_components/roles";

/** Super Admin retrospective review queue for MVP-03 preparation corrections. */
export default function PreparationCorrectionsPage() {
  const { status, principal, authFetch } = useAuth();
  const router = useRouter();
  const [queue, setQueue] = useState<ListPreparationCorrectionsResponseBody | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload() {
    setQueue(await listPreparationCorrections(authFetch));
  }

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status !== "authenticated") return;
    (async () => {
      try {
        await reload();
      } catch (err) {
        setError(err instanceof TasksApiError ? err.message : "โหลดคิว Review ไม่สำเร็จ");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- authFetch is stable per AuthProvider render.
  }, [status, router]);

  if (status === "loading" || (status === "authenticated" && !queue && !error)) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-sm text-slate-500">กำลังโหลด...</p>
      </main>
    );
  }
  if (status !== "authenticated" || !principal) return null;

  const canReview = canReviewPreparationCorrection(principal.roleCodes);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Preparation Correction Review</h1>
          <p className="text-sm text-slate-500">คิว Review ย้อนหลังของ Correction/Exception Record</p>
        </div>
        <Link href="/tasks" className="rounded border border-slate-300 px-4 py-2 text-sm">กลับรายการงาน</Link>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {queue && queue.items.length === 0 && <p className="text-sm text-slate-500">ไม่มีรายการรอ Review</p>}

      <div className="grid gap-3">
        {queue?.items.map((item) => (
          <section key={item.id} className="grid gap-3 border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
              <div>
                <p className="font-medium">{item.materiality} · {item.reviewStatus}</p>
                <p className="text-slate-500">{item.changeSummary}</p>
              </div>
              <Link href={`/tasks/${item.taskId}`} className="rounded border border-slate-300 px-3 py-1">เปิดงาน</Link>
            </div>
            <p className="text-sm">{item.reason}</p>
            {item.reviewNote && <p className="text-sm text-slate-500">Review: {item.reviewNote}</p>}
            {canReview && item.reviewStatus === "PENDING_REVIEW" && (
              <div className="flex flex-col gap-2">
                <textarea
                  aria-label={`review-note-${item.id}`}
                  value={reviewNotes[item.id] ?? ""}
                  onChange={(event) => setReviewNotes((notes) => ({ ...notes, [item.id]: event.target.value }))}
                  className="min-h-20 rounded border border-slate-300 px-2 py-2 text-sm"
                  placeholder="บันทึก Review"
                />
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => {
                    setBusyId(item.id);
                    setError(null);
                    void reviewPreparationCorrection(authFetch, item.id, reviewNotes[item.id] ?? "")
                      .then(() => reload())
                      .catch((err) => setError(err instanceof TasksApiError ? err.message : "บันทึก Review ไม่สำเร็จ"))
                      .finally(() => setBusyId(null));
                  }}
                  className="w-fit rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  บันทึก Review
                </button>
              </div>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
