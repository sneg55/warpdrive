"use client";
import { useRef, useState } from "react";
import { settleAction } from "@/lib/actionFailure";
import { readCsrfToken } from "@/utils/csrfCookie";
import { type ConvertOutcome, type ConvertSurface, convertFailure } from "../convertOutcome";
import type { LeadRow } from "../leadRepo";
import { bulkConvertLeadsAction, convertLeadAction } from "../leadServerActions";

export interface UseLeadConvertDeps {
  refetch: () => Promise<void>;
  clearSelection: () => void;
  goToDeal: (dealId: string) => void;
}

export interface UseLeadConvertResult {
  convertError: string | null;
  clearConvertError: () => void;
  reportConvertError: (message: string) => void;
  convertTarget: LeadRow | "bulk" | null;
  setConvertTarget: (target: LeadRow | "bulk" | null) => void;
  bulkConvertPending: boolean;
  bulkConvert: (
    ids: string[],
    customFields?: Record<string, unknown>,
    surface?: ConvertSurface,
  ) => Promise<ConvertOutcome>;
  convertRow: (
    row: LeadRow,
    customFields?: Record<string, unknown>,
    surface?: ConvertSurface,
  ) => Promise<ConvertOutcome>;
}

const BUSY: ConvertOutcome = { ok: false, id: "", message: "A conversion is already running." };

function partialFailureNotice(converted: number, failed: number, failureId: string): string {
  const noun = converted === 1 ? "lead" : "leads";
  return `${converted} ${noun} converted, ${failed} could not be converted (${failureId}). The failed leads are still in the list, try them again.`;
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

  function fail(id: string, surface: ConvertSurface): ConvertOutcome {
    const outcome = convertFailure(id);
    if (!outcome.ok && surface === "banner") setConvertError(outcome.message);
    return outcome;
  }

  async function bulkConvert(
    ids: string[],
    customFields: Record<string, unknown> = {},
    surface: ConvertSurface = "banner",
  ): Promise<ConvertOutcome> {
    if (ids.length === 0 || bulkConverting.current) return BUSY;
    bulkConverting.current = true;
    setBulkConvertPending(true);
    setConvertError(null);
    try {
      const r = await settleAction(() =>
        bulkConvertLeadsAction({ ids, customFields }, readCsrfToken()),
      );
      if (!r.ok) {
        await refetch();
        return fail(r.error.id, surface);
      }
      clearSelection();
      await refetch();
      if (r.value.failed > 0) {
        setConvertError(
          partialFailureNotice(r.value.converted, r.value.failed, r.value.failureId ?? "unknown"),
        );
      }
      return { ok: true };
    } finally {
      bulkConverting.current = false;
      setBulkConvertPending(false);
    }
  }

  async function convertRow(
    row: LeadRow,
    customFields: Record<string, unknown> = {},
    surface: ConvertSurface = "banner",
  ): Promise<ConvertOutcome> {
    if (converting.current) return BUSY;
    converting.current = true;
    setConvertError(null);
    try {
      const r = await settleAction(() =>
        convertLeadAction(
          { leadId: row.id, expectedUpdatedAt: row.updatedAt.toISOString(), customFields },
          readCsrfToken(),
        ),
      );
      if (r.ok) {
        goToDeal(r.value.dealId);
        return { ok: true };
      }
      const outcome = fail(r.error.id, surface);
      await refetch();
      return outcome;
    } finally {
      converting.current = false;
    }
  }

  return {
    convertError,
    clearConvertError: () => setConvertError(null),
    reportConvertError: setConvertError,
    convertTarget,
    setConvertTarget,
    bulkConvertPending,
    bulkConvert,
    convertRow,
  };
}
