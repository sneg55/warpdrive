"use client";
import type React from "react";
import { BulkActionBar } from "@/components/data-table/BulkActionBar";
import type { BulkActivityProgress, BulkActivityRunKind } from "./useActivityBulkActions";

const BULK_BUTTON =
  "rounded-md border px-3 py-1 text-sm transition-transform hover:bg-accent active:scale-[0.96] disabled:opacity-50";

function bulkLabel(
  progress: BulkActivityProgress | null,
  kind: BulkActivityRunKind,
  idle: string,
  running: string,
): string {
  if (progress === null || progress.kind !== kind) return idle;
  return `${running} ${progress.done}/${progress.total}...`;
}

export function ActivityBulkBar({
  count,
  progress,
  onClear,
  onMarkDone,
  onDelete,
}: {
  count: number;
  progress: BulkActivityProgress | null;
  onClear: () => void;
  onMarkDone: () => void;
  onDelete: () => void;
}): React.ReactNode {
  const busy = progress !== null;
  return (
    <BulkActionBar count={count} onClear={onClear}>
      <button type="button" disabled={busy} onClick={onMarkDone} className={BULK_BUTTON}>
        {bulkLabel(progress, "markDone", "Mark done", "Marking done")}
      </button>
      <button type="button" disabled={busy} onClick={onDelete} className={BULK_BUTTON}>
        {bulkLabel(progress, "delete", "Delete", "Deleting")}
      </button>
    </BulkActionBar>
  );
}
