import type React from "react";
import type { RenderWindow } from "@/components/data-table/useRenderWindow";
import { ActivityDayGroups } from "./ActivityDayGroups";
import type { ActivityTableRow } from "./activityRows";

interface Props {
  loadFailed: boolean;
  loadPending: boolean;
  // Painted slice of the full row set; count header / select-all / bulk actions stay over the
  // full set upstream, so this only bounds how many <tr> mount at once.
  rowWindow: RenderWindow<ActivityTableRow>;
  groupByDay: boolean;
  renderRow: (row: ActivityTableRow) => React.ReactNode;
  columnCount: number;
  onRetry: () => void;
}

// The activities table body: the load-error / loading / empty branch, the (optionally
// day-grouped) rows, and the render-window "Show more" control. Extracted from ActivitiesTable
// so that component stays under the cognitive-complexity cap.
export function ActivityTableBody({
  loadFailed,
  loadPending,
  rowWindow,
  groupByDay,
  renderRow,
  columnCount,
  onRetry,
}: Props): React.ReactNode {
  if (loadFailed) {
    return (
      <tr>
        <td
          colSpan={columnCount}
          role="alert"
          className="px-3 py-10 text-center text-muted-foreground"
        >
          Couldn&apos;t load activities.{" "}
          <button
            type="button"
            onClick={onRetry}
            className="font-medium text-primary underline underline-offset-2 hover:opacity-90"
          >
            Retry
          </button>
        </td>
      </tr>
    );
  }
  if (loadPending) {
    return (
      <tr>
        <td colSpan={columnCount} className="px-3 py-10 text-center text-muted-foreground">
          Loading activities&hellip;
        </td>
      </tr>
    );
  }
  // visible is a prefix of the full row set, so an empty slice means an empty set.
  if (rowWindow.visible.length === 0) {
    return (
      <tr>
        <td colSpan={columnCount} className="px-3 py-10 text-center text-muted-foreground">
          No activities in this view.
        </td>
      </tr>
    );
  }
  return (
    <>
      {groupByDay ? (
        <ActivityDayGroups
          rows={rowWindow.visible}
          columnCount={columnCount}
          renderRow={renderRow}
        />
      ) : (
        rowWindow.visible.map(renderRow)
      )}
      {rowWindow.hasMore ? (
        <tr>
          <td colSpan={columnCount} className="px-3 py-3 text-center">
            <button
              type="button"
              onClick={rowWindow.showMore}
              className="rounded-md border px-4 py-1.5 text-sm transition-transform hover:bg-accent active:scale-[0.96]"
            >
              Show more ({rowWindow.remaining} more)
            </button>
          </td>
        </tr>
      ) : null}
    </>
  );
}
