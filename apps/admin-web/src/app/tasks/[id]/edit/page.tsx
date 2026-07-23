"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { DeliveryTaskDetailDto } from "@dispatch/contracts";
import { useAuth } from "../../../auth-context";
import { getDeliveryTask, TasksApiError, updateDeliveryTaskDraft } from "../../../../lib/tasks-client";
import { DestinationSelector, type DestinationSelection } from "../../_components/destination-selector";
import { GoodsLinesEditor, type GoodsLineDraft } from "../../_components/goods-lines-editor";
import { TaskReferencesEditor, type TaskReferenceDraft } from "../../_components/task-references-editor";
import { canCreateEditSubmitTasks } from "../../_components/roles";

/** DRAFT-only Task editing (§9). Server rejects (409) any edit once the Task has left DRAFT. */
export default function EditTaskPage() {
  const { status, principal, authFetch } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const taskId = params.id;

  const [task, setTask] = useState<DeliveryTaskDetailDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [changingDestination, setChangingDestination] = useState(false);
  const [destination, setDestination] = useState<DestinationSelection | null>(null);
  const [plannedDeliveryDate, setPlannedDeliveryDate] = useState("");
  const [items, setItems] = useState<GoodsLineDraft[]>([]);
  const [references, setReferences] = useState<TaskReferenceDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
        setPlannedDeliveryDate(result.plannedDeliveryDate ?? "");
        setItems(result.items);
        setReferences(result.references);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof TasksApiError ? err.message : "ไม่พบงานที่ต้องการ");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- authFetch is stable per AuthProvider render; re-running on every render would refetch in a loop.
  }, [status, router, taskId]);

  if (status === "loading" || (status === "authenticated" && !task && !loadError)) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm text-slate-500">กำลังโหลด…</p>
      </main>
    );
  }
  if (status !== "authenticated" || !principal) {
    return null;
  }
  if (!canCreateEditSubmitTasks(principal.roleCodes)) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm text-red-600">คุณไม่มีสิทธิ์แก้ไขงาน</p>
      </main>
    );
  }
  if (loadError || !task) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p role="alert" className="text-sm text-red-600">
          {loadError ?? "ไม่พบงานที่ต้องการ"}
        </p>
      </main>
    );
  }
  if (task.status !== "DRAFT") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm text-slate-700">งานนี้ถูกส่งแล้วและไม่สามารถแก้ไขได้อีก</p>
        <Link href={`/tasks/${task.id}`} className="mt-2 inline-block text-sm underline">
          กลับไปหน้ารายละเอียดงาน
        </Link>
      </main>
    );
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateDeliveryTaskDraft(authFetch, task!.id, {
        ...(destination
          ? {
              searchId: destination.searchId,
              destinationSource: destination.destinationSource,
              customerId: destination.customerId,
              customerDestinationId: destination.customerDestinationId,
              freeTextFallbackReason: destination.freeTextFallbackReason,
              customerName: destination.customerName,
              destinationName: destination.destinationName,
              address: destination.address,
              contactName: destination.contactName,
              contactPhone: destination.contactPhone,
              deliveryInstructions: destination.deliveryInstructions,
              locationReference: destination.locationReference,
              accessNotes: destination.accessNotes,
            }
          : {}),
        plannedDeliveryDate: plannedDeliveryDate || null,
        items,
        references,
      });
      router.push(`/tasks/${updated.id}`);
    } catch (err) {
      setSaveError(err instanceof TasksApiError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <h1 className="text-2xl font-semibold">แก้ไขแบบร่าง — {task.taskNumber}</h1>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">ปลายทางปัจจุบัน</h2>
          {!changingDestination && (
            <button
              type="button"
              onClick={() => setChangingDestination(true)}
              className="rounded border border-slate-300 px-3 py-1 text-xs"
            >
              เปลี่ยนปลายทาง
            </button>
          )}
        </div>
        {!changingDestination ? (
          <dl className="grid gap-1 rounded border border-slate-200 p-3 text-sm">
            <div>
              <dt className="inline text-slate-500">แหล่งที่มา: </dt>
              <dd className="inline">{task.destinationSource}</dd>
            </div>
            <div>
              <dt className="inline text-slate-500">ปลายทาง: </dt>
              <dd className="inline">{task.destinationName}</dd>
            </div>
            <div>
              <dt className="inline text-slate-500">ที่อยู่: </dt>
              <dd className="inline">{task.address}</dd>
            </div>
          </dl>
        ) : (
          <DestinationSelector onChange={setDestination} />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">รายละเอียดการจัดส่ง</h2>
        <label className="flex max-w-xs flex-col gap-1 text-sm">
          วันที่วางแผนจัดส่ง
          <input
            type="date"
            value={plannedDeliveryDate}
            onChange={(e) => setPlannedDeliveryDate(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <GoodsLinesEditor items={items} onChange={setItems} />
        <TaskReferencesEditor references={references} onChange={setReferences} />
      </section>

      {saveError && (
        <p role="alert" className="text-sm text-red-600">
          {saveError}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          disabled={saving || (changingDestination && !destination)}
          onClick={() => void handleSave()}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "กำลังบันทึก…" : "บันทึกแบบร่าง"}
        </button>
        <Link href={`/tasks/${task.id}`} className="rounded border border-slate-300 px-4 py-2 text-sm">
          ยกเลิก
        </Link>
      </div>
    </main>
  );
}
