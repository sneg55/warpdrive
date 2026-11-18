"use client";
import { useRef, useState } from "react";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { readCsrfToken } from "@/utils/csrfCookie";
import { archiveLeadAction, bulkUpdateLeadsAction } from "../leadServerActions";
import type { BulkUpdateLeadsInput } from "../schemas";

type Change = BulkUpdateLeadsInput["change"];

export interface LeadMutations {
  applying: boolean;
  isRowBusy: (id: string) => boolean;
  bulkChange: (ids: string[], change: Change) => Promise<void>;
  archiveToggle: (id: string, archived: boolean) => Promise<void>;
}

export function useLeadMutations({
  refetch,
  clearSelection,
}: {
  refetch: () => Promise<void>;
  clearSelection: () => void;
}): LeadMutations {
  const reportError = useActionError();
  const applyingRef = useRef(false);
  const [applying, setApplying] = useState(false);
  const busyRows = useRef(new Set<string>());
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());

  function markRow(id: string, on: boolean): void {
    if (on) busyRows.current.add(id);
    else busyRows.current.delete(id);
    setBusyIds(new Set(busyRows.current));
  }

  async function bulkChange(ids: string[], change: Change): Promise<void> {
    if (ids.length === 0 || applyingRef.current) return;
    applyingRef.current = true;
    setApplying(true);
    try {
      const r = await bulkUpdateLeadsAction({ ids, change }, readCsrfToken());
      if (!r.ok) {
        reportError(r.error.id);
        return;
      }
      clearSelection();
      await refetch();
    } catch {
      reportError();
    } finally {
      applyingRef.current = false;
      setApplying(false);
    }
  }

  async function archiveToggle(id: string, archived: boolean): Promise<void> {
    if (busyRows.current.has(id)) return;
    markRow(id, true);
    try {
      const r = await archiveLeadAction({ leadId: id, archived }, readCsrfToken());
      if (r.ok) await refetch();
      else reportError(r.error.id);
    } catch {
      reportError();
    } finally {
      markRow(id, false);
    }
  }

  return { applying, isRowBusy: (id) => busyIds.has(id), bulkChange, archiveToggle };
}
