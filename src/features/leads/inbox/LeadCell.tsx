"use client";
import { TriangleAlert } from "lucide-react";
import type React from "react";
import { CustomFieldCell } from "@/components/data-table/CustomFieldCell";
import { OwnerBadge } from "@/features/identity/OwnerBadge";
import type { ResolvedLabel } from "@/features/labels/resolveLabels";
import { useLabelChipResolver } from "@/features/labels/useLabelChipResolver";
import { formatCurrency } from "@/lib/formatCurrency";
import type { LeadRow } from "../leadRepo";
import type { LeadColumn } from "./columns";
import { nextActivityState } from "./nextActivityState";

function fmtDate(d: Date | string | null): string {
  if (d === null) return "-";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function NextActivity({
  at,
  now,
}: {
  at: Date | string | null;
  now: Date | null;
}): React.ReactNode {
  if (at === null) {
    return (
      <span className="flex items-center gap-1 text-warning">
        <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5" />
        No activity
      </span>
    );
  }
  // Pre-mount `now` is null (server + first client render): render the date with no time-based
  // color so SSR and hydration agree. The overdue/today color appears once the clock is set.
  if (now === null) {
    return <span>{fmtDate(at)}</span>;
  }
  const state = nextActivityState(at, now);
  return <span className={state === "overdue" ? "text-destructive" : ""}>{fmtDate(at)}</span>;
}

function Labels({ chips }: { chips: ResolvedLabel[] }): React.ReactNode {
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((chip) => (
        <span
          key={chip.name}
          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${chip.classes}`}
        >
          {chip.name}
        </span>
      ))}
    </div>
  );
}

export function LeadCell({
  column,
  row,
  now,
  currency,
}: {
  column: LeadColumn;
  row: LeadRow;
  now: Date | null;
  currency: string;
}): React.ReactNode {
  const resolveLabels = useLabelChipResolver("lead");
  if (column.customField) {
    return (
      <CustomFieldCell
        def={column.customField}
        value={row.customFields[column.customField.key]}
        currency={currency}
      />
    );
  }
  switch (column.key) {
    case "title":
      return <span className="font-medium text-foreground">{row.title}</span>;
    case "nextActivity":
      return <NextActivity at={row.nextActivityAt} now={now} />;
    case "labels":
      return <Labels chips={resolveLabels(row.labels)} />;
    case "sourceOrigin":
      return <span className="text-muted-foreground">{row.sourceOrigin.replace(/_/g, " ")}</span>;
    case "value":
      return (
        <span className="tabular-nums text-muted-foreground">
          {row.value !== null ? formatCurrency(row.value, currency) : "-"}
        </span>
      );
    case "createdAt":
      return <span className="text-muted-foreground">{fmtDate(row.createdAt)}</span>;
    case "owner":
      return <OwnerBadge name={row.ownerName} />;
    default:
      return null;
  }
}
