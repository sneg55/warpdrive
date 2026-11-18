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
  convertTarget: LeadRow | "bulk" | null;
  setConvertTarget: (target: LeadRow | "bulk" | null) => void;
  bulkConvertPending: boolean;
  bulkConvert: (ids: string[], customFields?: Record<string, unknown>) => Promise<boolean>;
  convertRow: (row: LeadRow, customFields?: Record<string, unknown>) => Promise<boolean>;
}

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
