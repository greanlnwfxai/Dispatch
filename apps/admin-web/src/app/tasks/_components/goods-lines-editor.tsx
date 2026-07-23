"use client";

import type { DeliveryTaskItemDto } from "@dispatch/contracts";

export type GoodsLineDraft = DeliveryTaskItemDto;

/** Planned goods line editor (§4.7, §9 Step 3). Planned quantities only — no stock/loaded/delivered fields. */
export function GoodsLinesEditor({
  items,
  onChange,
}: {
  items: GoodsLineDraft[];
  onChange: (items: GoodsLineDraft[]) => void;
}) {
  function updateLine(index: number, patch: Partial<GoodsLineDraft>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addLine() {
    const nextLineNumber = items.length > 0 ? Math.max(...items.map((i) => i.lineNumber)) + 1 : 1;
    onChange([...items, { lineNumber: nextLineNumber, description: "", plannedQuantity: "1", unit: "", notes: null }]);
  }

  function removeLine(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-slate-700">รายการสินค้าที่วางแผน</p>
      {items.length === 0 && <p className="text-sm text-slate-500">ยังไม่มีรายการสินค้า</p>}
      {items.map((item, index) => (
        <div key={index} className="grid grid-cols-12 gap-2 rounded border border-slate-200 p-3">
          <input
            aria-label={`คำอธิบายรายการที่ ${index + 1}`}
            placeholder="รายละเอียดสินค้า"
            value={item.description}
            onChange={(e) => updateLine(index, { description: e.target.value })}
            className="col-span-5 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <input
            aria-label={`จำนวนรายการที่ ${index + 1}`}
            placeholder="จำนวน"
            value={item.plannedQuantity}
            onChange={(e) => updateLine(index, { plannedQuantity: e.target.value })}
            className="col-span-2 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <input
            aria-label={`หน่วยรายการที่ ${index + 1}`}
            placeholder="หน่วย"
            value={item.unit}
            onChange={(e) => updateLine(index, { unit: e.target.value })}
            className="col-span-2 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <input
            aria-label={`หมายเหตุรายการที่ ${index + 1}`}
            placeholder="หมายเหตุ (ไม่บังคับ)"
            value={item.notes ?? ""}
            onChange={(e) => updateLine(index, { notes: e.target.value || null })}
            className="col-span-2 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={() => removeLine(index)}
            className="col-span-1 rounded border border-slate-300 text-xs text-red-600"
          >
            ลบ
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addLine}
        className="self-start rounded border border-slate-300 px-3 py-1 text-xs font-medium"
      >
        + เพิ่มรายการสินค้า
      </button>
    </div>
  );
}
