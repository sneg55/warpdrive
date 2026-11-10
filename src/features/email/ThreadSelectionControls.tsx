"use client";
import { BulkActionBar } from "@/components/data-table/BulkActionBar";
import type { useRowSelection } from "@/components/data-table/useRowSelection";
import { Checkbox } from "@/components/ui/Checkbox";
import { Skeleton } from "@/components/ui/Skeleton";
import { canArchiveInFolder, canSelectInFolder, type ThreadFolder } from "./ThreadRow";

export function ThreadSelectionControls({
  folder,
  selection,
  visibleIds,
  showSkeleton,
  count,
  bulkBusy,
  bulkArchive,
  bulkMarkRead,
  bulkMarkUnread,
}: {
  folder: ThreadFolder;
  selection: ReturnType<typeof useRowSelection>;
  visibleIds: string[];
  showSkeleton: boolean;
  count: number;
  bulkBusy: boolean;
  bulkArchive: () => void;
  bulkMarkRead: () => void;
  bulkMarkUnread: () => void;
}): React.ReactNode {
  return (
    <>
      <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          {canSelectInFolder(folder) && (
            <Checkbox
              label="Select all threads"
              checked={selection.allSelected(visibleIds)}
              onCheckedChange={() => selection.toggleAll(visibleIds)}
            />
          )}
          {showSkeleton ? (
            <Skeleton className="h-3 w-24" />
          ) : (
            <span className="tabular-nums">
              {count} {count === 1 ? "conversation" : "conversations"}
            </span>
          )}
        </div>
      </div>

      {canSelectInFolder(folder) && selection.count > 0 && (
        <div className="border-b px-3 py-2">
          <BulkActionBar count={selection.count} onClear={selection.clear}>
            <div role="toolbar" aria-label="Bulk actions" className="flex flex-wrap gap-2">
              {canArchiveInFolder(folder) && (
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={bulkArchive}
                  className="rounded-md border px-3 py-1 text-sm transition-transform hover:bg-accent active:scale-[0.96] disabled:opacity-50"
                >
                  {folder === "archive" ? "Unarchive" : "Archive"}
                </button>
              )}
              <button
                type="button"
                disabled={bulkBusy}
                onClick={bulkMarkRead}
                className="rounded-md border px-3 py-1 text-sm transition-transform hover:bg-accent active:scale-[0.96] disabled:opacity-50"
              >
                Mark read
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={bulkMarkUnread}
                className="rounded-md border px-3 py-1 text-sm transition-transform hover:bg-accent active:scale-[0.96] disabled:opacity-50"
              >
                Mark unread
              </button>
            </div>
          </BulkActionBar>
        </div>
      )}
    </>
  );
}
