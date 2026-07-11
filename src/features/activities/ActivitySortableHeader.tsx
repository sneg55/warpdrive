"use client";
import type React from "react";
import type { ColumnSort } from "@/components/data-table/useColumnSort";
import type { ActivitySortField } from "./schemas";

// Extracted from ActivitiesTable to keep it under the project's file-size budget (mirrors
// PeopleTable's SortableHeader/SortGlyph, applied to the Activities table's sort fields).
function SortGlyph({ dir }: { dir: "asc" | "desc" | null }): React.ReactNode {
  if (dir === null) return null;
  return (
    <span aria-hidden="true" className="ml-1 inline-block text-[10px]">
      {dir === "asc" ? "▲" : "▼"}
    </span>
  );
}

export function ActivitySortableTh({
  field,
  label,
  sort,
  onSort,
}: {
  field: ActivitySortField;
  label: string;
  sort: ColumnSort<ActivitySortField>;
  onSort: (field: ActivitySortField) => void;
}): React.ReactNode {
  return (
    <th className="px-3 py-2 font-semibold">
      <button
        type="button"
        onClick={() => onSort(field)}
        className="inline-flex items-center font-semibold hover:text-foreground"
      >
        {label}
        <SortGlyph dir={sort.field === field ? sort.dir : null} />
      </button>
    </th>
  );
}
