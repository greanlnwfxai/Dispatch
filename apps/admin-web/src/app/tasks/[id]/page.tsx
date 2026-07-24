"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { DeliveryTaskDetailDto, PreparationDetailDto } from "@dispatch/contracts";
import { useAuth } from "../../auth-context";
import {
  confirmPreparationReady,
  createPreparationCorrection,
  createPreparationIssue,
  getDeliveryTask,
  getPreparation,
  resolvePreparationIssue,
  startPreparation,
  submitDeliveryTask,
  TasksApiError,
  updatePreparation,
  uploadPreparationEvidence,
} from "../../../lib/tasks-client";
import { canCreateEditSubmitTasks, canCreatePreparationCorrection, canWritePreparation } from "../_components/roles";
import { AssignmentSection } from "./_components/assignment-section";

/**
 * Task detail with MVP-03 preparation workflow and MVP-04 assignment
 * (READY_FOR_DISPATCH -> ASSIGNED, formal reassignment while ASSIGNED). No
 * start-delivery, Attempt, Reopen, Override, or DELETE action exists.
 */
export default function TaskDetailPage() {
  const { status, principal, authFetch } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const taskId = params.id;

  const [task, setTask] = useState<DeliveryTaskDetailDto | null>(null);
  const [preparation, setPreparation] = useState<PreparationDetailDto | null>(null);
  const [preparedDrafts, setPreparedDrafts] = useState<Record<string, { preparedQuantity: string; notes: string }>>({});
  const [issueText, setIssueText] = useState("");
  const [issueItemId, setIssueItemId] = useState("");
  const [resolveNotes, setResolveNotes] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [openedEvidenceUrl, setOpenedEvidenceUrl] = useState<string | null>(null);
  const [correctionMateriality, setCorrectionMateriality] = useState<"NORMAL" | "MATERIAL">("NORMAL");
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionSummary, setCorrectionSummary] = useState("");
  const [correctionSnapshot, setCorrectionSnapshot] = useState("{\n  \"type\": \"exception\"\n}");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const [taskResult, preparationResult] = await Promise.all([
      getDeliveryTask(authFetch, taskId),
      getPreparation(authFetch, taskId),
    ]);
    setTask(taskResult);
    setPreparation(preparationResult);
    if (preparationResult) {
      setPreparedDrafts(
        Object.fromEntries(
          preparationResult.items.map((item) => [
            item.id,
            { preparedQuantity: item.preparedQuantity, notes: item.notes ?? "" },
          ]),
        ),
      );
    }
  }

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status !== "authenticated") return;
    let cancelled = false;
    (async () => {
      try {
        await reload();
      } catch (err) {
        if (!cancelled) setError(err instanceof TasksApiError ? err.message : "ไม่พบงานที่ต้องการ");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- authFetch is stable per AuthProvider render.
  }, [status, router, taskId]);

  useEffect(() => {
    return () => {
      if (openedEvidenceUrl) URL.revokeObjectURL(openedEvidenceUrl);
    };
  }, [openedEvidenceUrl]);

  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof TasksApiError ? err.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading" || (status === "authenticated" && !task && !error)) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-sm text-slate-500">กำลังโหลด...</p>
      </main>
    );
  }
  if (status !== "authenticated" || !principal) return null;
  if (error && !task) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12">
        <p role="alert" className="text-sm text-red-600">{error}</p>
      </main>
    );
  }
  if (!task) return null;

  const canManageTask = canCreateEditSubmitTasks(principal.roleCodes);
  const canPrepare = canWritePreparation(principal.roleCodes);
  const canCreateCorrection = canCreatePreparationCorrection(principal.roleCodes);
  const isDraft = task.status === "DRAFT";
  const isWaitingPreparation = task.status === "WAITING_PREPARATION";
  const isPreparing = task.status === "PREPARING";
  const canUseCorrectionGovernance = ["IN_TRANSIT", "AT_DESTINATION", "WAITING_NEXT_ATTEMPT", "COMPLETED", "CANCELLED"].includes(task.status);
  const unresolvedIssues = preparation?.issues.filter((issue) => issue.status === "OPEN").length ?? 0;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{task.taskNumber}</h1>
          <p className="text-sm text-slate-500">สถานะ: {task.status}</p>
          <p className="text-sm text-slate-500">
            หลักฐานก่อนโหลด: {preparation && preparation.evidence.length > 0 ? "มีแล้ว" : "ยังไม่มี"} · ปัญหาค้าง: {unresolvedIssues}
          </p>
        </div>
        {canManageTask && isDraft && (
          <div className="flex gap-2">
            <Link href={`/tasks/${task.id}/edit`} className="rounded border border-slate-300 px-4 py-2 text-sm">แก้ไข</Link>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(async () => {
                if (!window.confirm("ยืนยันการส่งงานเข้าสู่ขั้นตอนรอจัดเตรียมสินค้า?")) return;
                setTask(await submitDeliveryTask(authFetch, task.id));
              })}
              className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              ส่งงาน
            </button>
          </div>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <section className="border-t border-slate-200 pt-5">
        <h2 className="mb-3 text-sm font-medium uppercase text-slate-500">ปลายทาง (Historical Snapshot)</h2>
        <dl className="grid gap-1 text-sm">
          <div><dt className="inline text-slate-500">ลูกค้า: </dt><dd className="inline">{task.customerName}</dd></div>
          <div><dt className="inline text-slate-500">ปลายทาง: </dt><dd className="inline">{task.destinationName}</dd></div>
          <div><dt className="inline text-slate-500">ที่อยู่: </dt><dd className="inline">{task.address}</dd></div>
          <div><dt className="inline text-slate-500">วันที่วางแผนจัดส่ง: </dt><dd className="inline">{task.plannedDeliveryDate ?? "-"}</dd></div>
        </dl>
      </section>

      <section className="border-t border-slate-200 pt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium uppercase text-slate-500">การเตรียมสินค้า</h2>
          {canPrepare && isWaitingPreparation && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(async () => {
                const started = await startPreparation(authFetch, task.id);
                setPreparation(started);
                setTask((current) => current ? { ...current, status: started.taskStatus } : current);
              })}
              className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              เริ่มเตรียมสินค้า
            </button>
          )}
        </div>

        {!preparation && <p className="text-sm text-slate-500">ยังไม่มีข้อมูลการเตรียมสินค้า</p>}

        {preparation && (
          <div className="grid gap-6">
            <div className="overflow-x-auto border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">รายการ</th>
                    <th className="px-3 py-2">แผน</th>
                    <th className="px-3 py-2">เตรียมจริง</th>
                    <th className="px-3 py-2">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {preparation.items.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">{item.lineNumber}. {item.descriptionSnapshot}</td>
                      <td className="px-3 py-2">{item.plannedQuantitySnapshot} {item.unitSnapshot}</td>
                      <td className="px-3 py-2">
                        <input
                          aria-label={`prepared-${item.lineNumber}`}
                          disabled={!canPrepare || !isPreparing || busy}
                          value={preparedDrafts[item.id]?.preparedQuantity ?? item.preparedQuantity}
                          onChange={(event) => setPreparedDrafts((drafts) => ({ ...drafts, [item.id]: { ...(drafts[item.id] ?? { notes: "" }), preparedQuantity: event.target.value } }))}
                          className="w-28 rounded border border-slate-300 px-2 py-1 disabled:bg-slate-50"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          aria-label={`note-${item.lineNumber}`}
                          disabled={!canPrepare || !isPreparing || busy}
                          value={preparedDrafts[item.id]?.notes ?? ""}
                          onChange={(event) => setPreparedDrafts((drafts) => ({ ...drafts, [item.id]: { ...(drafts[item.id] ?? { preparedQuantity: item.preparedQuantity }), notes: event.target.value } }))}
                          className="w-full rounded border border-slate-300 px-2 py-1 disabled:bg-slate-50"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {canPrepare && isPreparing && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(async () => {
                  setPreparation(await updatePreparation(authFetch, task.id, {
                    items: preparation.items.map((item) => ({
                      preparationItemId: item.id,
                      preparedQuantity: preparedDrafts[item.id]?.preparedQuantity ?? item.preparedQuantity,
                      notes: preparedDrafts[item.id]?.notes ?? null,
                    })),
                  }));
                })}
                className="w-fit rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                บันทึกจำนวนที่เตรียม
              </button>
            )}

            <div className="grid gap-3 border-t border-slate-200 pt-5">
              <h3 className="text-sm font-medium uppercase text-slate-500">ปัญหาการเตรียมสินค้า</h3>
              {preparation.issues.length === 0 && <p className="text-sm text-slate-500">ไม่มีปัญหาที่บันทึกไว้</p>}
              {preparation.issues.map((issue) => (
                <div key={issue.id} className="grid gap-2 border border-slate-200 p-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <span>{issue.description}</span>
                    <span className={issue.status === "OPEN" ? "font-medium text-red-700" : "text-emerald-700"}>{issue.status}</span>
                  </div>
                  {issue.status === "OPEN" && canPrepare && isPreparing && (
                    <div className="flex gap-2">
                      <input
                        aria-label={`resolve-${issue.id}`}
                        placeholder="บันทึกการแก้ไข"
                        value={resolveNotes[issue.id] ?? ""}
                        onChange={(event) => setResolveNotes((notes) => ({ ...notes, [issue.id]: event.target.value }))}
                        className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(async () => setPreparation(await resolvePreparationIssue(authFetch, task.id, issue.id, { resolutionNote: resolveNotes[issue.id] ?? "" })))}
                        className="rounded border border-slate-300 px-3 py-1"
                      >
                        แก้ไขแล้ว
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {canPrepare && isPreparing && (
                <div className="grid gap-2">
                  <select value={issueItemId} onChange={(event) => setIssueItemId(event.target.value)} className="rounded border border-slate-300 px-2 py-2 text-sm">
                    <option value="">ทั้งงาน</option>
                    {preparation.items.map((item) => <option key={item.id} value={item.id}>{item.lineNumber}. {item.descriptionSnapshot}</option>)}
                  </select>
                  <textarea value={issueText} onChange={(event) => setIssueText(event.target.value)} className="min-h-20 rounded border border-slate-300 px-2 py-2 text-sm" placeholder="รายละเอียดปัญหา" />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(async () => {
                      const updated = await createPreparationIssue(authFetch, task.id, { preparationItemId: issueItemId || null, description: issueText });
                      setIssueText("");
                      setIssueItemId("");
                      setPreparation(updated);
                    })}
                    className="w-fit rounded border border-slate-300 px-4 py-2 text-sm"
                  >
                    เพิ่มปัญหา
                  </button>
                </div>
              )}
            </div>

            <div className="grid gap-3 border-t border-slate-200 pt-5">
              <h3 className="text-sm font-medium uppercase text-slate-500">รูปก่อนโหลดสินค้า</h3>
              {preparation.evidence.length === 0 && <p className="text-sm text-slate-500">ยังไม่มีรูปก่อนโหลดสินค้า</p>}
              <div className="flex flex-wrap gap-2">
                {preparation.evidence.map((evidence) => (
                  <button
                    key={evidence.id}
                    type="button"
                    className="rounded border border-slate-300 px-3 py-2 text-sm"
                    onClick={() => void run(async () => {
                      const response = await authFetch(evidence.downloadPath);
                      if (!response.ok) throw new TasksApiError("เปิดรูปไม่สำเร็จ", response.status);
                      const blob = await response.blob();
                      if (openedEvidenceUrl) URL.revokeObjectURL(openedEvidenceUrl);
                      setOpenedEvidenceUrl(URL.createObjectURL(blob));
                    })}
                  >
                    เปิดรูป {evidence.originalFilename}
                  </button>
                ))}
              </div>
              {openedEvidenceUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- Authenticated Blob preview; Next Image cannot fetch this private object URL.
                <img src={openedEvidenceUrl} alt="pre-loading evidence" className="max-h-80 w-fit border border-slate-200 object-contain" />
              )}
              {canPrepare && isPreparing && (
                <div className="grid gap-2">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      const selected = event.target.files?.[0] ?? null;
                      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
                      setFile(selected);
                      setFilePreviewUrl(selected ? URL.createObjectURL(selected) : null);
                    }}
                    className="text-sm"
                  />
                  {file && <p className="text-sm text-slate-500">{file.name} · {Math.round(file.size / 1024)} KB · {file.type || "unknown"}</p>}
                  {filePreviewUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- Local in-memory upload preview, never persisted or optimized remotely.
                    <img src={filePreviewUrl} alt="upload preview" className="max-h-64 w-fit border border-slate-200 object-contain" />
                  )}
                  <button
                    type="button"
                    disabled={busy || !file}
                    onClick={() => void run(async () => {
                      if (!file) return;
                      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
                        throw new TasksApiError("ไฟล์ต้องเป็น JPG, PNG หรือ WebP และไม่เกิน 5 MB", 400);
                      }
                      setPreparation(await uploadPreparationEvidence(authFetch, task.id, file));
                      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
                      setFilePreviewUrl(null);
                      setFile(null);
                    })}
                    className="w-fit rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    อัปโหลดรูป
                  </button>
                </div>
              )}
            </div>

            {canPrepare && isPreparing && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(async () => {
                  if (!window.confirm("ยืนยันว่าสินค้าพร้อมจัดส่ง? ข้อมูลการเตรียมสินค้าจะถูกล็อกสำหรับขั้นตอนนี้")) return;
                  const ready = await confirmPreparationReady(authFetch, task.id);
                  setPreparation(ready);
                  await reload();
                })}
                className="w-fit rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                ยืนยันพร้อมจัดส่ง
              </button>
            )}

            <div className="grid gap-3 border-t border-slate-200 pt-5">
              <h3 className="text-sm font-medium uppercase text-slate-500">Correction/Exception Governance</h3>
              {preparation.corrections.length === 0 && <p className="text-sm text-slate-500">ยังไม่มี Correction/Exception Record</p>}
              {preparation.corrections.map((correction) => (
                <div key={correction.id} className="grid gap-1 border border-slate-200 p-3 text-sm">
                  <div className="flex flex-wrap justify-between gap-3">
                    <span>{correction.materiality} · {correction.reviewStatus}</span>
                    <span className="text-slate-500">{correction.createdAt}</span>
                  </div>
                  <p>{correction.changeSummary}</p>
                  {correction.reviewNote && <p className="text-slate-500">Review: {correction.reviewNote}</p>}
                </div>
              ))}
              {canCreateCorrection && canUseCorrectionGovernance && (
                <div className="grid gap-2 border border-slate-200 p-3">
                  <select
                    aria-label="materiality"
                    value={correctionMateriality}
                    onChange={(event) => setCorrectionMateriality(event.target.value as "NORMAL" | "MATERIAL")}
                    className="rounded border border-slate-300 px-2 py-2 text-sm"
                  >
                    <option value="NORMAL">NORMAL</option>
                    <option value="MATERIAL">MATERIAL</option>
                  </select>
                  <input
                    aria-label="correction-reason"
                    value={correctionReason}
                    onChange={(event) => setCorrectionReason(event.target.value)}
                    className="rounded border border-slate-300 px-2 py-2 text-sm"
                    placeholder="เหตุผล"
                  />
                  <input
                    aria-label="correction-summary"
                    value={correctionSummary}
                    onChange={(event) => setCorrectionSummary(event.target.value)}
                    className="rounded border border-slate-300 px-2 py-2 text-sm"
                    placeholder="สรุปการแก้ไข/ข้อยกเว้น"
                  />
                  <textarea
                    aria-label="correction-snapshot"
                    value={correctionSnapshot}
                    onChange={(event) => setCorrectionSnapshot(event.target.value)}
                    className="min-h-28 rounded border border-slate-300 px-2 py-2 font-mono text-sm"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(async () => {
                      const parsed = JSON.parse(correctionSnapshot) as Record<string, unknown>;
                      const updated = await createPreparationCorrection(authFetch, task.id, {
                        materiality: correctionMateriality,
                        reason: correctionReason,
                        changeSummary: correctionSummary,
                        correctedOrExceptionSnapshot: parsed,
                      });
                      setPreparation(updated);
                      setCorrectionReason("");
                      setCorrectionSummary("");
                    })}
                    className="w-fit rounded border border-slate-300 px-4 py-2 text-sm"
                  >
                    สร้าง Correction/Exception
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {(task.status === "READY_FOR_DISPATCH" || task.status === "ASSIGNED") && (
        <section className="border-t border-slate-200 pt-5">
          <h2 className="mb-3 text-sm font-medium uppercase text-slate-500">การมอบหมายงาน</h2>
          <AssignmentSection taskId={task.id} taskStatus={task.status} onAssigned={() => void reload()} />
        </section>
      )}

      <section className="border-t border-slate-200 pt-5">
        <h2 className="mb-2 text-sm font-medium uppercase text-slate-500">ประวัติสถานะ</h2>
        <ul className="text-sm">
          {task.events.map((event, index) => (
            <li key={index}>{event.occurredAt} - {event.eventType} ({event.previousStatus ?? "-"} {"->"} {event.newStatus})</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
