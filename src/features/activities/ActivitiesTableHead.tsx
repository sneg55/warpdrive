"use client";
import type React from "react";
import type { ColumnSort } from "@/components/data-table/useColumnSort";
import { Checkbox } from "@/components/ui/Checkbox";
import { ActivitySortableTh } from "./ActivitySortableHeader";
import type { ActivitySortField } from "./schemas";

interface ActivitiesTableHeadProps {
  effective: ColumnSort<ActivitySortField>;
  onSort: (field: ActivitySortField) => void;
  allSelected: boolean;
  onToggleAll: () => void;
}

// The Activities table's <thead>, extracted from ActivitiesTable to keep it under the
// project's file-size budget. Column order and labels are Pipedrive parity (Task 8's
// Duration/Assignee columns, Task 9's sortable Duration).
export function ActivitiesTableHead({
  effective,
  onSort,
  allSelected,
  onToggleAll,
}: ActivitiesTableHeadProps): React.ReactNode {
  return (
    <thead className="sticky top-0 bg-muted/60 text-left text-xs uppercase text-muted-foreground">
      <tr>
        <th className="w-8 px-3 py-2">
          <Checkbox
            label="Select all activities"
            checked={allSelected}
            onCheckedChange={onToggleAll}
          />
        </th>
        <th className="px-3 py-2 font-semibold">Done</th>
        <ActivitySortableTh field="subject" label="Subject" sort={effective} onSort={onSort} />
        <th className="px-3 py-2 font-semibold">Deal</th>
        <ActivitySortableTh field="priority" label="Priority" sort={effective} onSort={onSort} />
        <th className="px-3 py-2 font-semibold">Contact</th>
        <th className="px-3 py-2 font-semibold">Email</th>
        <th className="px-3 py-2 font-semibold">Phone</th>
        <th className="px-3 py-2 font-semibold">Organization</th>
        <ActivitySortableTh field="dueAtIso" label="Due" sort={effective} onSort={onSort} />
        <ActivitySortableTh field="duration" label="Duration" sort={effective} onSort={onSort} />
        <th className="px-3 py-2 font-semibold">Assignee</th>
      </tr>
    </thead>
  );
}
