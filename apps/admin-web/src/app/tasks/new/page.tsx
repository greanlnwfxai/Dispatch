"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../auth-context";
import { createDeliveryTask, TasksApiError } from "../../../lib/tasks-client";
import { DestinationSelector, type DestinationSelection } from "../_components/destination-selector";
import { GoodsLinesEditor, type GoodsLineDraft } from "../_components/goods-lines-editor";
import { TaskReferencesEditor, type TaskReferenceDraft } from "../_components/task-references-editor";
import { canCreateEditSubmitTasks } from "../_components/roles";

/**
 * Task creation flow (§9 Steps 1-4): search-first destination selection,
 * delivery details, then Save as DRAFT. Submission to WAITING_PREPARATION
 * happens as a separate, explicitly confirmed action on the Task detail
 * page — never automatically after creation.
 */
export default function NewTaskPage() {
  const { status, principal, authFetch } = useAuth();
  const router = useRouter();

  const [destination, setDestination] = useState<DestinationSelection | null>(null);
  const [plannedDeliveryDate, setPlannedDeliveryDate] = useState("");
  const [items, setItems] = useState<GoodsLineDraft[]>([]);
  const [references, setReferences] = useState<TaskReferenceDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "loading") {
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
        <p className="text-sm text-red-600">คุณไม่มีสิทธิ์สร้างงาน</p>
      </main>
    );
  }

  async function handleSaveDraft() {
    if (!destination) {
      setError("กรุณาเลือกปลายทางก่อนบันทึกงาน");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await createDeliveryTask(authFetch, {
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
        plannedDeliveryDate: plannedDeliveryDate || null,
        items,
        references,
      });
      router.push(`/tasks/${created.id}`);
    } catch (err) {
      setError(err instanceof TasksApiError ? err.message : "บันทึกงานไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <h1 className="text-2xl font-semibold">สร้างงานจัดส่งใหม่</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">1. ค้นหาลูกค้า/ปลายทาง</h2>
        <DestinationSelector onChange={setDestination} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">2. รายละเอียดการจัดส่ง</h2>
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

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          disabled={submitting || !destination}
          onClick={() => void handleSaveDraft()}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "กำลังบันทึก…" : "บันทึกเป็นแบบร่าง (Save as Draft)"}
        </button>
      </div>
    </main>
  );
}
