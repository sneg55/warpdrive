"use client";
import { useRef, useState } from "react";
import type { RowSelection } from "@/components/data-table/useRowSelection";
import { readCsrfToken } from "@/utils/csrfCookie";
import { completeActivityAction, deleteActivityAction } from "./actions";
import { useInvalidateActivityLists } from "./useInvalidateActivityLists";

const BULK_MARK_DONE_ERROR = "Couldn't mark some activities done. Please try again.";
const BULK_DELETE_ERROR = "Couldn't delete some activities. Please try again.";

export type BulkActivityRunKind = "markDone" | "delete";

export interface BulkActivityProgress {
  kind: BulkActivityRunKind;
  done: number;
  total: number;
}

async function succeeded(action: () => Promise<{ ok: boolean }>): Promise<boolean> {
  try {
    return (await action()).ok;
  } catch {
    return false;
  }
}

export interface ActivityBulkActions {
  error: string | null;
  progress: BulkActivityProgress | null;
  bulkMarkDone: () => Promise<void>;
  bulkDelete: () => Promise<void>;
}

export function useActivityBulkActions(selection: RowSelection): ActivityBulkActions {
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<BulkActivityProgress | null>(null);
  const inFlight = useRef(false);
  const invalidateActivityLists = useInvalidateActivityLists();

  async function run(
    kind: BulkActivityRunKind,
    action: (id: string) => Promise<{ ok: boolean }>,
    failureError: string,
  ): Promise<void> {
    const ids = [...selection.selected];
    if (ids.length === 0 || inFlight.current) return;
    inFlight.current = true;
    setProgress({ kind, done: 0, total: ids.length });
    try {
      const outcomes = await Promise.all(
        ids.map(async (id) => {
          const ok = await succeeded(() => action(id));
          setProgress((p) => (p === null ? p : { ...p, done: p.done + 1 }));
          return { id, ok };
        }),
      );
      const failedIds = outcomes.filter((o) => !o.ok).map((o) => o.id);
      if (failedIds.length < ids.length) await invalidateActivityLists();
      selection.clear();
      for (const id of failedIds) selection.toggle(id);
      setError(failedIds.length > 0 ? failureError : null);
    } finally {
      inFlight.current = false;
      setProgress(null);
    }
  }

  return {
    error,
    progress,
    bulkMarkDone: () =>
      run(
        "markDone",
        (id) => completeActivityAction({ id, done: true }, readCsrfToken()),
        BULK_MARK_DONE_ERROR,
      ),
    bulkDelete: () =>
      run("delete", (id) => deleteActivityAction({ id }, readCsrfToken()), BULK_DELETE_ERROR),
  };
}
