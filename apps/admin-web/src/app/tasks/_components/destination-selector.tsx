"use client";

import { useState } from "react";
import type { CustomerMasterSearchResultDto, DestinationSource, FreeTextFallbackReason } from "@dispatch/contracts";
import { useAuth } from "../../auth-context";
import { searchCustomerMaster, TasksApiError } from "../../../lib/tasks-client";

export interface DestinationSelection {
  searchId: string;
  destinationSource: DestinationSource;
  customerId?: string | null;
  customerDestinationId?: string | null;
  freeTextFallbackReason?: FreeTextFallbackReason | null;
  customerName: string;
  destinationName: string;
  address: string;
  contactName: string | null;
  contactPhone: string | null;
  deliveryInstructions: string | null;
  locationReference: string | null;
  accessNotes: string | null;
}

interface FreeTextFields {
  customerName: string;
  destinationName: string;
  address: string;
  contactName: string;
  contactPhone: string;
  deliveryInstructions: string;
  locationReference: string;
  accessNotes: string;
}

const EMPTY_FREE_TEXT_FIELDS: FreeTextFields = {
  customerName: "",
  destinationName: "",
  address: "",
  contactName: "",
  contactPhone: "",
  deliveryInstructions: "",
  locationReference: "",
  accessNotes: "",
};

/**
 * Search-first Customer/Destination Master selection (§4.3, §9 Step 1-2).
 * Free-text fallback is only offered after a search has been performed —
 * there is no way to reach the Free-text form without calling
 * POST /customer-master/search first. Selecting "save as Customer Master"
 * is never offered (§4.1/§9 — Free-text must never create/link a Master
 * record).
 */
export function DestinationSelector({ onChange }: { onChange: (selection: DestinationSelection | null) => void }) {
  const { authFetch } = useAuth();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [results, setResults] = useState<CustomerMasterSearchResultDto[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<CustomerMasterSearchResultDto | null>(null);
  const [fallbackReason, setFallbackReason] = useState<FreeTextFallbackReason | null>(null);
  const [freeTextFields, setFreeTextFields] = useState<FreeTextFields>(EMPTY_FREE_TEXT_FIELDS);

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    setSearching(true);
    setSearchError(null);
    try {
      const result = await searchCustomerMaster(authFetch, query);
      setSearchId(result.searchId);
      setResults(result.results);
      setHasSearched(true);
      setSelectedMatch(null);
      setFallbackReason(null);
      onChange(null);
    } catch (error) {
      setSearchError(error instanceof TasksApiError ? error.message : "ค้นหาไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSearching(false);
    }
  }

  function selectMaster(match: CustomerMasterSearchResultDto) {
    setSelectedMatch(match);
    setFallbackReason(null);
    if (!searchId) return;
    onChange({
      searchId,
      destinationSource: "MASTER",
      customerId: match.customerId,
      customerDestinationId: match.customerDestinationId,
      freeTextFallbackReason: null,
      customerName: match.customerName,
      destinationName: match.destinationName,
      address: match.address,
      contactName: match.contactName,
      contactPhone: match.contactPhone,
      deliveryInstructions: match.deliveryInstructions,
      locationReference: match.locationReference,
      accessNotes: match.accessNotes,
    });
  }

  function chooseFallback(reason: FreeTextFallbackReason) {
    setSelectedMatch(null);
    setFallbackReason(reason);
    onChange(null);
  }

  function resetSearch() {
    setHasSearched(false);
    setSearchId(null);
    setResults([]);
    setSelectedMatch(null);
    setFallbackReason(null);
    setFreeTextFields(EMPTY_FREE_TEXT_FIELDS);
    onChange(null);
  }

  function updateFreeTextField<K extends keyof FreeTextFields>(key: K, value: string) {
    const next = { ...freeTextFields, [key]: value };
    setFreeTextFields(next);
    if (!searchId || !fallbackReason) return;
    onChange({
      searchId,
      destinationSource: "FREE_TEXT",
      customerId: null,
      customerDestinationId: null,
      freeTextFallbackReason: fallbackReason,
      customerName: next.customerName,
      destinationName: next.destinationName,
      address: next.address,
      contactName: next.contactName || null,
      contactPhone: next.contactPhone || null,
      deliveryInstructions: next.deliveryInstructions || null,
      locationReference: next.locationReference || null,
      accessNotes: next.accessNotes || null,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form className="flex gap-2" onSubmit={handleSearch}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาลูกค้า/ปลายทาง"
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-base"
        />
        <button
          type="submit"
          disabled={searching || query.trim().length === 0}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {searching ? "กำลังค้นหา…" : "ค้นหา"}
        </button>
        {hasSearched && (
          <button type="button" onClick={resetSearch} className="rounded border border-slate-300 px-4 py-2 text-sm">
            ค้นหาใหม่
          </button>
        )}
      </form>

      {searchError && (
        <p role="alert" className="text-sm text-red-600">
          {searchError}
        </p>
      )}

      {hasSearched && !selectedMatch && !fallbackReason && (
        <div className="flex flex-col gap-2">
          {results.length === 0 && <p className="text-sm text-slate-500">ไม่พบข้อมูลที่ตรงกัน</p>}
          <ul className="flex flex-col gap-2">
            {results.map((match) => (
              <li
                key={match.customerDestinationId}
                className="flex items-center justify-between rounded border border-slate-200 p-3"
              >
                <div>
                  <p className="text-sm font-medium">{match.destinationName}</p>
                  <p className="text-xs text-slate-500">
                    {match.customerName} · {match.address}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => selectMaster(match)}
                  className="rounded border border-slate-300 px-3 py-1 text-xs font-medium"
                >
                  เลือก
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={() => chooseFallback("NO_SUITABLE_MASTER")}
              className="rounded border border-slate-300 px-3 py-2 text-xs"
            >
              ไม่พบข้อมูลที่เหมาะสม
            </button>
            <button
              type="button"
              onClick={() => chooseFallback("AD_HOC_DESTINATION")}
              className="rounded border border-slate-300 px-3 py-2 text-xs"
            >
              ปลายทางเฉพาะกิจ
            </button>
          </div>
        </div>
      )}

      {selectedMatch && (
        <div className="rounded border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">แหล่งที่มา: MASTER</p>
          <dl className="mt-2 grid gap-1 text-sm">
            <div>
              <dt className="inline text-slate-500">ลูกค้า: </dt>
              <dd className="inline">{selectedMatch.customerName}</dd>
            </div>
            <div>
              <dt className="inline text-slate-500">ปลายทาง: </dt>
              <dd className="inline">{selectedMatch.destinationName}</dd>
            </div>
            <div>
              <dt className="inline text-slate-500">ที่อยู่: </dt>
              <dd className="inline">{selectedMatch.address}</dd>
            </div>
          </dl>
        </div>
      )}

      {fallbackReason && (
        <div className="flex flex-col gap-3 rounded border border-slate-200 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            แหล่งที่มา: FREE_TEXT ({fallbackReason === "NO_SUITABLE_MASTER" ? "ไม่พบข้อมูลที่เหมาะสม" : "ปลายทางเฉพาะกิจ"})
          </p>
          <label className="flex flex-col gap-1 text-sm">
            ชื่อลูกค้า
            <input
              value={freeTextFields.customerName}
              onChange={(e) => updateFreeTextField("customerName", e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            ชื่อปลายทาง
            <input
              value={freeTextFields.destinationName}
              onChange={(e) => updateFreeTextField("destinationName", e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            ที่อยู่
            <textarea
              value={freeTextFields.address}
              onChange={(e) => updateFreeTextField("address", e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            ผู้ติดต่อ (ไม่บังคับ)
            <input
              value={freeTextFields.contactName}
              onChange={(e) => updateFreeTextField("contactName", e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            เบอร์ติดต่อ (ไม่บังคับ)
            <input
              value={freeTextFields.contactPhone}
              onChange={(e) => updateFreeTextField("contactPhone", e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
      )}
    </div>
  );
}
