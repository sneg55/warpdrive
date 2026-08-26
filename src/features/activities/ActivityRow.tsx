"use client";
import Link from "next/link";
import type React from "react";
import { useEffect, useRef } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { ACTIVITY_PRIORITIES, isActivityPriorityKey } from "@/constants/activityPriorities";
import { OwnerBadge } from "@/features/identity/OwnerBadge";
import { cn } from "@/lib/utils";
import { ActivityTypeIcon } from "./ActivityTypeIcon";
import type { ActivityTableRow } from "./activityRows";
import { fmtDue } from "./dueLabel";
import { isActivityOverdue } from "./overdue";

// Wrapped at module scope so the clock read stays out of the render body (React Compiler
// flags Date.now() called during render). An all-day row is late only once its DAY has passed.
function isOverdue(row: ActivityTableRow): boolean {
  return isActivityOverdue(
    row.dueAtIso === null ? null : new Date(row.dueAtIso),
    row.allDay,
    row.done,
    Date.now(),
  );
}

// Extracted from ActivitiesTable to keep both files under the project's file-size budget
// (mirrors PeopleTable/PeopleList): a single Pipedrive-style row, with a selection checkbox
// (bulk actions) kept independent of the Done checkbox (per-row complete/reopen).
export interface ActivityRowProps {
  row: ActivityTableRow;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onToggleDone: (id: string, currentDone: boolean) => void;
  onRowClick: (row: ActivityTableRow) => void;
  // True for the single row under the j/k keyboard cursor.
  cursor: boolean;
}

function fmtDuration(minutes: number | null): string {
  return minutes === null ? "" : `${minutes} min`;
}

export function ActivityRow({
  row,
  selected,
  onToggleSelect,
  onToggleDone,
  onRowClick,
  cursor,
}: ActivityRowProps): React.ReactNode {
  const ref = useRef<HTMLTableRowElement>(null);

  // Keep the cursor row in view when j/k walks past the edge of the scroll container.
  useEffect(() => {
    if (cursor) ref.current?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return (
    <tr
      ref={ref}
      onClick={() => onRowClick(row)}
      data-cursor={cursor ? "true" : undefined}
      className={cn(
        "cursor-pointer border-t hover:bg-accent/40",
        isOverdue(row) && "text-destructive",
        cursor && "bg-accent/60 ring-1 ring-inset ring-ring",
      )}
    >
      <td className="px-3 py-2">
        {/* Row is clickable (opens the editor); the span stops the checkbox click from
            bubbling to the row so selecting does not also open the modal. The Checkbox owns
            its own interaction, so the wrapper is a pure pointer-propagation guard. */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: propagation guard only */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: propagation guard only */}
        <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            label={`Select ${row.subject}`}
            checked={selected}
            onCheckedChange={() => onToggleSelect(row.id)}
          />
        </span>
      </td>
      <td className="px-3 py-2">
        {/* biome-ignore lint/a11y/noStaticElementInteractions: propagation guard only */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: propagation guard only */}
        <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            label={`Complete ${row.subject}`}
            checked={row.done}
            onCheckedChange={() => onToggleDone(row.id, row.done)}
            // Round and green, matching the deal workspace's activity card, so Done never
            // reads as a second copy of the square selection box sitting next to it.
            className="rounded-full data-[state=checked]:border-success data-[state=checked]:bg-success data-[state=checked]:text-success-foreground"
          />
        </span>
      </td>
      <td className="px-3 py-2">
        <span className="flex items-center gap-2">
          <ActivityTypeIcon typeKey={row.typeKey} />
          <span className={cn("font-medium", row.done && "text-muted-foreground line-through")}>
            {row.subject}
          </span>
        </span>
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {row.dealId !== null ? (
          <Link href={`/deals/${row.dealId}`} onClick={(e) => e.stopPropagation()}>
            {row.dealTitle ?? "Deal"}
          </Link>
        ) : (
          "-"
        )}
      </td>
      <td className="px-3 py-2">
        {row.priority !== null && isActivityPriorityKey(row.priority) ? (
          <span style={{ color: ACTIVITY_PRIORITIES[row.priority].color }}>
            {ACTIVITY_PRIORITIES[row.priority].name}
          </span>
        ) : (
          "-"
        )}
      </td>
      <td className="px-3 py-2">
        {row.personId !== null && row.personName !== null ? (
          <Link href={`/contacts/people/${row.personId}`} onClick={(e) => e.stopPropagation()}>
            {row.personName}
          </Link>
        ) : (
          (row.personName ?? "-")
        )}
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {row.personEmail !== null ? (
          <a href={`mailto:${row.personEmail}`} onClick={(e) => e.stopPropagation()}>
            {row.personEmail}
          </a>
        ) : (
          "-"
        )}
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {row.personPhone !== null ? (
          <a href={`tel:${row.personPhone}`} onClick={(e) => e.stopPropagation()}>
            {row.personPhone}
          </a>
        ) : (
          "-"
        )}
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {row.orgId !== null && row.orgName !== null ? (
          <Link href={`/contacts/orgs/${row.orgId}`} onClick={(e) => e.stopPropagation()}>
            {row.orgName}
          </Link>
        ) : (
          (row.orgName ?? "-")
        )}
      </td>
      <td className="px-3 py-2 text-muted-foreground tabular-nums">
        {fmtDue(row.dueAtIso, row.allDay)}
      </td>
      <td className="px-3 py-2 text-muted-foreground tabular-nums">
        {fmtDuration(row.durationMinutes)}
      </td>
      <td className="px-3 py-2">
        <OwnerBadge name={row.assigneeName} />
      </td>
    </tr>
  );
}
