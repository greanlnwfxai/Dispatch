"use client";

import type { TaskReferenceDto } from "@dispatch/contracts";

export type TaskReferenceDraft = TaskReferenceDto;

/**
 * Optional business-reference editor (BDR-TASK-001 — OPEN, no reference
 * type is mandatory in this milestone; see docs/CTO_SUMMARY_MVP_02.md).
 */
export function TaskReferencesEditor({
  references,
  onChange,
}: {
  references: TaskReferenceDraft[];
  onChange: (references: TaskReferenceDraft[]) => void;
}) {
  function updateReference(index: number, patch: Partial<TaskReferenceDraft>) {
    onChange(references.map((reference, i) => (i === index ? { ...reference, ...patch } : reference)));
  }

  function addReference() {
    onChange([...references, { referenceType: "", referenceValue: "" }]);
  }

  function removeReference(index: number) {
    onChange(references.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-slate-700">เอกสารอ้างอิงทางธุรกิจ (ไม่บังคับ)</p>
      {references.map((reference, index) => (
        <div key={index} className="grid grid-cols-12 gap-2">
          <input
            aria-label={`ประเภทเอกสารอ้างอิงที่ ${index + 1}`}
            placeholder="ประเภท (เช่น PO_NUMBER)"
            value={reference.referenceType}
            onChange={(e) => updateReference(index, { referenceType: e.target.value })}
            className="col-span-5 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <input
            aria-label={`เลขที่เอกสารอ้างอิงที่ ${index + 1}`}
            placeholder="เลขที่เอกสาร"
            value={reference.referenceValue}
            onChange={(e) => updateReference(index, { referenceValue: e.target.value })}
            className="col-span-6 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={() => removeReference(index)}
            className="col-span-1 rounded border border-slate-300 text-xs text-red-600"
          >
            ลบ
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addReference}
        className="self-start rounded border border-slate-300 px-3 py-1 text-xs font-medium"
      >
        + เพิ่มเอกสารอ้างอิง
      </button>
    </div>
  );
}
