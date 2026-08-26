"use client";
import { useRef, useState } from "react";
import { readCsrfToken } from "@/utils/csrfCookie";
import type { LeadRow } from "../leadRepo";
import { bulkConvertLeadsAction, convertLeadAction } from "../leadServerActions";
import { convertErrorMessage } from "./convertErrorMessage";

export interface UseLeadConvertDeps {
  refetch: () => Promise<void>;
  clearSelection: () => void;
  goToDeal: (dealId: string) => void;
}

export interface UseLeadConvertResult {
  convertError: string | null;
  clearConvertError: () => void;
  // Which lead (or the whole selection) the custom-field dialog is open for; null when closed.
  convertTarget: LeadRow | "bulk" | null;
  setConvertTarget: (target: LeadRow | "bulk" | null) => void;
  bulkConvertPending: boolean;
  bulkConvert: (ids: string[], customFields?: Record<string, unknown>) => Promise<boolean>;
  convertRow: (row: LeadRow, customFields?: Record<string, unknown>) => Promise<boolean>;
}

// Lead -> deal conversion for the inbox: the single-row path, the bulk path, their in-flight
// guards, and the one error banner both report through.
export function useLeadConvert({
  refetch,
  clearSelection,
  goToDeal,
}: UseLeadConvertDeps): UseLeadConvertResult {
  const [convertError, setConvertError] = useState<string | null>(null);
  const [convertTarget, setConvertTarget] = useState<LeadRow | "bulk" | null>(null);
  const [bulkConvertPending, setBulkConvertPending] = useState(false);
  const bulkConverting = useRef(false);
  const converting = useRef(false);

  async function bulkConvert(
    ids: string[],
    customFields: Record<string, unknown> = {},
  ): Promise<boolean> {
    if (ids.length === 0) return false;
    // In-flight guard: a rapid double-click must not fire two overlapping batches (mirrors
    // convertRow's converting ref for the single-lead button).
    if (bulkConverting.current) return false;
    bulkConverting.current = true;
    setBulkConvertPending(true);
    setConvertError(null);
    try {
      const r = await bulkConvertLeadsAction({ ids, customFields }, readCsrfToken());
      if (r.ok) {
        clearSelection();
        await refetch();
        return true;
      }
      // Systemic failure (e.g. PERM_DENIED, no resolvable pipeline): surface it like convertRow
      // does and do NOT clear the selection or refetch as if the batch had succeeded.
      setConvertError(convertErrorMessage(r.error.id));
      return false;
    } finally {
      bulkConverting.current = false;
      setBulkConvertPending(false);
    }
  }

  async function convertRow(
    row: LeadRow,
    customFields: Record<string, unknown> = {},
  ): Promise<boolean> {
    // In-flight guard: a rapid double-click must not fire two convert calls (the second would
    // race to a confusing "already converted"/stale-CAS banner even though the first succeeded).
    if (converting.current) return false;
    converting.current = true;
    setConvertError(null);
    try {
      const r = await convertLeadAction(
        { leadId: row.id, expectedUpdatedAt: row.updatedAt.toISOString(), customFields },
        readCsrfToken(),
      );
      if (r.ok) {
        goToDeal(r.value.dealId);
        return true;
      }
      // Stale CAS / already-converted / permission denied: show copy and refetch so the row
      // reflects the current server state (e.g. it now renders as "Converted").
      setConvertError(convertErrorMessage(r.error.id));
      await refetch();
      return false;
    } finally {
      converting.current = false;
    }
  }

  return {
    convertError,
    clearConvertError: () => setConvertError(null),
    convertTarget,
    setConvertTarget,
    bulkConvertPending,
    bulkConvert,
    convertRow,
  };
}
