"use client";
import type React from "react";
import { Fragment } from "react";
import type { ActivityTableRow } from "./activityRows";
import { isoToDayHeading } from "./dayHeading";
import { localDayIso } from "./weekAgenda";

const NO_DATE_HEADING = "No date";

interface Props {
  rows: ActivityTableRow[];
  renderRow: (row: ActivityTableRow) => React.ReactNode;
  columnCount: number;
}

function dayKey(dueAtIso: string | null): string {
  if (dueAtIso === null) return NO_DATE_HEADING;
  // dueAtIso is a full ISO timestamp ("...T09:00:00.000Z"). ActivityRow's fmtDue() renders
  // this same timestamp in the viewer's LOCAL time via toLocaleString(), so the day-group
  // header must bucket by that same local calendar day, not the UTC date embedded in the
  // ISO string, otherwise a row can file under a header that contradicts its own Due cell
  // (e.g. "...T02:00:00.000Z" is still the previous evening in western timezones).
  return isoToDayHeading(localDayIso(new Date(dueAtIso)));
}

// Groups list rows under day-header rows (Pipedrive list parity). Undated rows fall under a
// trailing "No date" group. Order within a group mirrors the incoming row order (the table's
// own sort already governs that); a group's position is set by the first row that lands in it.
//
// Renders flat <tr> siblings (one header row per group, then that group's rows) rather than
// nesting a <section>/<h3> wrapper: the table content model only allows <tr> as a direct child
// of <tbody>, so anything else placed there breaks the table's rendering.
export function ActivityDayGroups({ rows, renderRow, columnCount }: Props): React.ReactNode {
  const groups = new Map<string, ActivityTableRow[]>();
  for (const r of rows) {
    const key = dayKey(r.dueAtIso);
    const bucket = groups.get(key) ?? [];
    bucket.push(r);
    groups.set(key, bucket);
  }

  return (
    <>
      {Array.from(groups.entries()).map(([heading, bucket]) => (
        <Fragment key={heading}>
          <tr>
            <td
              colSpan={columnCount}
              className="bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground"
            >
              <h3>{heading}</h3>
            </td>
          </tr>
          {bucket.map(renderRow)}
        </Fragment>
      ))}
    </>
  );
}
