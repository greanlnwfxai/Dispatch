"use client";

import { useEffect, useState } from "react";
import type { AssignmentCandidateDto, AssignmentRecordDto, DeliveryTaskStatus } from "@dispatch/contracts";
import { useAuth } from "../../../auth-context";
import {
  AssignmentConflictError,
  assignTask,
  getAssignmentHistory,
  getCurrentAssignment,
  listAssignmentCandidates,
  reassignTask,
  TasksApiError,
} from "../../../../lib/tasks-client";
import { canAssignTasks } from "../../_components/roles";

interface AssignmentSectionProps {
  taskId: string;
  taskStatus: DeliveryTaskStatus;
  onAssigned: () => void;
}

interface CandidatePickerState {
  query: string;
  searching: boolean;
  error: string | null;
  candidates: AssignmentCandidateDto[];
  primaryUserId: string | null;
  supportUserIds: string[];
}

const EMPTY_PICKER: CandidatePickerState = {
  query: "",
  searching: false,
  error: null,
  candidates: [],
  primaryUserId: null,
  supportUserIds: [],
};

function personLabel(person: { displayName: string; userId: string }): string {
  return person.displayName;
}

/**
 * MVP-04 — Delivery Task Assignment. Renders the assign flow for
 * READY_FOR_DISPATCH and the current-assignment/history/reassign flow for
 * ASSIGNED. Supporting employees are always labeled informational-only
 * (BDR-ASSIGN-002) — never as able to perform delivery actions. No
 * start-delivery control is rendered; MVP-04 ends at ASSIGNED.
 */
export function AssignmentSection({ taskId, taskStatus, onAssigned }: AssignmentSectionProps) {
  const { authFetch, principal } = useAuth();
  const canAssign = principal ? canAssignTasks(principal.roleCodes) : false;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [current, setCurrent] = useState<AssignmentRecordDto | null>(null);
  const [history, setHistory] = useState<AssignmentRecordDto[]>([]);

  const [initialPicker, setInitialPicker] = useState<CandidatePickerState>(EMPTY_PICKER);
  const [note, setNote] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const [reassignPicker, setReassignPicker] = useState<CandidatePickerState>(EMPTY_PICKER);
  const [reason, setReason] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setLoadError(null);
    try {
      const [currentResult, historyResult] = await Promise.all([
        getCurrentAssignment(authFetch, taskId),
        getAssignmentHistory(authFetch, taskId),
      ]);
      setCurrent(currentResult.assignment);
      setHistory(historyResult.items);
    } catch (err) {
      setLoadError(err instanceof TasksApiError ? err.message : "โหลดข้อมูลการมอบหมายไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await reload();
      } catch {
        if (!cancelled) setLoadError("โหลดข้อมูลการมอบหมายไม่สำเร็จ");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- authFetch is stable per AuthProvider render.
  }, [taskId]);

  async function search(picker: CandidatePickerState, setPicker: (state: CandidatePickerState) => void) {
    setPicker({ ...picker, searching: true, error: null });
    try {
      const result = await listAssignmentCandidates(authFetch, { search: picker.query || undefined });
      setPicker({ ...picker, searching: false, candidates: result.items });
    } catch (err) {
      setPicker({ ...picker, searching: false, error: err instanceof TasksApiError ? err.message : "ค้นหาพนักงานจัดส่งไม่สำเร็จ" });
    }
  }

  function pickPrimary(picker: CandidatePickerState, setPicker: (state: CandidatePickerState) => void, userId: string) {
    setPicker({ ...picker, primaryUserId: userId, supportUserIds: picker.supportUserIds.filter((id) => id !== userId) });
  }

  function toggleSupport(picker: CandidatePickerState, setPicker: (state: CandidatePickerState) => void, userId: string) {
    if (userId === picker.primaryUserId) return;
    const already = picker.supportUserIds.includes(userId);
    setPicker({
      ...picker,
      supportUserIds: already ? picker.supportUserIds.filter((id) => id !== userId) : [...picker.supportUserIds, userId],
    });
  }

  function renderCandidatePicker(picker: CandidatePickerState, setPicker: (state: CandidatePickerState) => void) {
    return (
      <div className="grid gap-2">
        <div className="flex gap-2">
          <input
            aria-label="ค้นหาพนักงานจัดส่ง"
            value={picker.query}
            onChange={(event) => setPicker({ ...picker, query: event.target.value })}
            placeholder="ค้นหาพนักงานจัดส่งภายใน"
            className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={picker.searching}
            onClick={() => void search(picker, setPicker)}
            className="rounded border border-slate-300 px-4 py-2 text-sm disabled:opacity-50"
          >
            {picker.searching ? "กำลังค้นหา…" : "ค้นหา"}
          </button>
        </div>
        {picker.error && <p role="alert" className="text-sm text-red-600">{picker.error}</p>}
        {picker.candidates.length > 0 && (
          <ul className="grid gap-2">
            {picker.candidates.map((candidate) => {
              const isPrimary = picker.primaryUserId === candidate.userId;
              const isSupport = picker.supportUserIds.includes(candidate.userId);
              return (
                <li key={candidate.userId} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 p-2 text-sm">
                  <div>
                    <span className="font-medium">{candidate.displayName}</span>
                    {candidate.activeTaskCount > 0 && (
                      <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                        มีงานที่กำลังดำเนินการอยู่ {candidate.activeTaskCount} งาน
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => pickPrimary(picker, setPicker, candidate.userId)}
                      className={`rounded px-3 py-1 text-xs font-medium ${isPrimary ? "bg-slate-900 text-white" : "border border-slate-300"}`}
                    >
                      {isPrimary ? "ผู้รับผิดชอบหลัก ✓" : "เลือกเป็นผู้รับผิดชอบหลัก"}
                    </button>
                    <button
                      type="button"
                      disabled={isPrimary}
                      onClick={() => toggleSupport(picker, setPicker, candidate.userId)}
                      className={`rounded px-3 py-1 text-xs disabled:opacity-40 ${isSupport ? "bg-slate-200" : "border border-slate-300"}`}
                    >
                      {isSupport ? "ร่วมปฏิบัติงาน ✓" : "ร่วมปฏิบัติงาน (ข้อมูลเท่านั้น)"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  if (loading) return <p className="text-sm text-slate-500">กำลังโหลดข้อมูลการมอบหมาย...</p>;

  return (
    <div className="grid gap-6">
      {loadError && <p role="alert" className="text-sm text-red-600">{loadError}</p>}

      {current && (
        <div data-testid="current-assignment" className="grid gap-2 rounded border border-slate-200 p-3 text-sm">
          <p>
            <span className="text-slate-500">ผู้รับผิดชอบหลัก: </span>
            <span className="font-medium">{personLabel(current.primaryAssignee)}</span>
          </p>
          {current.supportingEmployees.length > 0 && (
            <p>
              <span className="text-slate-500">พนักงานร่วมปฏิบัติงาน (ข้อมูลเท่านั้น ไม่มีสิทธิ์ปฏิบัติงานแทนหรืออัปโหลดหลักฐาน): </span>
              {current.supportingEmployees.map(personLabel).join(", ")}
            </p>
          )}
          <p className="text-slate-500">
            มอบหมายโดย {personLabel(current.actor)} เมื่อ {current.createdAt}
            {current.assignmentType === "REASSIGNMENT" ? " (มอบหมายใหม่)" : " (มอบหมายครั้งแรก)"}
          </p>
          {current.note && <p className="text-slate-500">หมายเหตุ: {current.note}</p>}
          {current.reason && <p className="text-slate-500">เหตุผลการมอบหมายใหม่: {current.reason}</p>}
        </div>
      )}
      {!current && taskStatus === "READY_FOR_DISPATCH" && <p className="text-sm text-slate-500">ยังไม่มีการมอบหมาย</p>}

      {canAssign && taskStatus === "READY_FOR_DISPATCH" && !current && (
        <div className="grid gap-3 border-t border-slate-200 pt-4">
          <h3 className="text-sm font-medium uppercase text-slate-500">มอบหมายงาน</h3>
          {renderCandidatePicker(initialPicker, setInitialPicker)}
          <label className="flex flex-col gap-1 text-sm">
            หมายเหตุ (ไม่บังคับ)
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="min-h-16 rounded border border-slate-300 px-2 py-2 text-sm"
            />
          </label>
          {assignError && <p role="alert" className="text-sm text-red-600">{assignError}</p>}
          <button
            type="button"
            disabled={assigning || !initialPicker.primaryUserId}
            onClick={() => {
              if (!initialPicker.primaryUserId) return;
              if (!window.confirm("ยืนยันการมอบหมายงานนี้?")) return;
              setAssigning(true);
              setAssignError(null);
              assignTask(authFetch, taskId, {
                primaryAssigneeUserId: initialPicker.primaryUserId,
                supportingEmployeeUserIds: initialPicker.supportUserIds,
                note: note.trim() ? note : null,
              })
                .then(() => {
                  setInitialPicker(EMPTY_PICKER);
                  setNote("");
                  onAssigned();
                  return reload();
                })
                .catch((err: unknown) => setAssignError(err instanceof TasksApiError ? err.message : "มอบหมายงานไม่สำเร็จ"))
                .finally(() => setAssigning(false));
            }}
            className="w-fit rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            ยืนยันมอบหมายงาน
          </button>
        </div>
      )}

      {canAssign && taskStatus === "ASSIGNED" && current && (
        <div className="grid gap-3 border-t border-slate-200 pt-4">
          <h3 className="text-sm font-medium uppercase text-slate-500">มอบหมายใหม่ (Reassignment)</h3>
          {renderCandidatePicker(reassignPicker, setReassignPicker)}
          <label className="flex flex-col gap-1 text-sm">
            เหตุผลการมอบหมายใหม่ (บังคับ)
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="min-h-16 rounded border border-slate-300 px-2 py-2 text-sm"
            />
          </label>
          {reassignError && <p role="alert" className="text-sm text-red-600">{reassignError}</p>}
          <button
            type="button"
            disabled={reassigning || !reassignPicker.primaryUserId || reason.trim().length === 0}
            onClick={() => {
              if (!reassignPicker.primaryUserId || !current) return;
              if (!window.confirm("ยืนยันการมอบหมายงานนี้ใหม่?")) return;
              setReassigning(true);
              setReassignError(null);
              reassignTask(authFetch, taskId, {
                primaryAssigneeUserId: reassignPicker.primaryUserId,
                supportingEmployeeUserIds: reassignPicker.supportUserIds,
                reason,
                expectedCurrentAssignmentId: current.id,
              })
                .then(() => {
                  setReassignPicker(EMPTY_PICKER);
                  setReason("");
                  return reload();
                })
                .catch((err: unknown) => {
                  if (err instanceof AssignmentConflictError && err.code === "STALE_ASSIGNMENT") {
                    setReassignError(err.message);
                    void reload();
                    return;
                  }
                  setReassignError(err instanceof TasksApiError ? err.message : "มอบหมายใหม่ไม่สำเร็จ");
                })
                .finally(() => setReassigning(false));
            }}
            className="w-fit rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            ยืนยันมอบหมายใหม่
          </button>
        </div>
      )}

      {history.length > 0 && (
        <div data-testid="assignment-history" className="grid gap-2 border-t border-slate-200 pt-4">
          <h3 className="text-sm font-medium uppercase text-slate-500">ประวัติการมอบหมาย</h3>
          <ul className="grid gap-2 text-sm">
            {history.map((entry) => (
              <li key={entry.id} className="rounded border border-slate-200 p-2">
                <p>
                  {entry.createdAt} · {entry.assignmentType === "INITIAL" ? "มอบหมายครั้งแรก" : "มอบหมายใหม่"} · ผู้รับผิดชอบหลัก:{" "}
                  {personLabel(entry.primaryAssignee)}
                </p>
                {entry.supportingEmployees.length > 0 && (
                  <p className="text-slate-500">ผู้ร่วมปฏิบัติงาน (ข้อมูลเท่านั้น): {entry.supportingEmployees.map(personLabel).join(", ")}</p>
                )}
                <p className="text-slate-500">โดย {personLabel(entry.actor)}</p>
                {entry.note && <p className="text-slate-500">หมายเหตุ: {entry.note}</p>}
                {entry.reason && <p className="text-slate-500">เหตุผล: {entry.reason}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
