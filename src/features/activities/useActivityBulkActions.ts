"use client";
import { useState } from "react";
import type { RowSelection } from "@/components/data-table/useRowSelection";
import { readCsrfToken } from "@/utils/csrfCookie";
import { completeActivityAction, deleteActivityAction } from "./actions";

const BULK_MARK_DONE_ERROR = "Couldn't mark some activities done. Please try again.";
const BULK_DELETE_ERROR = "Couldn't delete some activities. Please try again.";

// Runs the given per-id action across all selected ids, returning the ids that failed. Doesn't
// swallow partial failures: callers keep failed ids selected and surface an error, mirroring the
// FIXED PeopleList bulk delete (a mid-set failure must not silently drop the rest, or the row).
async function runBulkAction(
  ids: readonly string[],
  action: (id: string) => Promise<{ ok: boolean }>,
): Promise<string[]> {
  const outcomes = await Promise.all(ids.map(async (id) => ({ id, result: await action(id) })));
  return outcomes.filter((o) => !o.result.ok).map((o) => o.id);
}

export interface ActivityBulkActions {
  error: string | null;
  bulkMarkDone: () => Promise<void>;
  bulkDelete: () => Promise<void>;
}

// Bulk mark-done/delete for the Activities table's selected rows. Extracted from ActivitiesTable
// (data logic vs. presentation) and to keep the container under the file-size budget.
export function useActivityBulkActions(
  selection: RowSelection,
  refetch: () => Promise<unknown>,
): ActivityBulkActions {
  const [error, setError] = useState<string | null>(null);

  async function run(
    action: (id: string) => Promise<{ ok: boolean }>,
    failureError: string,
  ): Promise<void> {
    const ids = [...selection.selected];
    if (ids.length === 0) return;
    const failedIds = await runBulkAction(ids, action);
    // Don't silently drop failures: clear only the ids that actually succeeded, keep the
    // failed ones selected (so the user sees exactly what still needs attention).
    selection.clear();
    for (const id of failedIds) selection.toggle(id);
    await refetch();
    setError(failedIds.length > 0 ? failureError : null);
  }

  return {
    error,
    bulkMarkDone: () =>
      run(
        (id) => completeActivityAction({ id, done: true }, readCsrfToken()),
        BULK_MARK_DONE_ERROR,
      ),
    bulkDelete: () => run((id) => deleteActivityAction({ id }, readCsrfToken()), BULK_DELETE_ERROR),
  };
}
