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
  return isoToDayHeading(localDayIso(new Date(dueAtIso)));
}

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
