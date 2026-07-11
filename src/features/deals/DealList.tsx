"use client";

import Link from "next/link";
import type React from "react";
import { useState } from "react";
import type { ColumnDef } from "@/components/data-table/columnModel";
import { Avatar } from "@/components/ui/Avatar";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select, type SelectOption } from "@/components/ui/Select";
import { formatCurrency } from "@/lib/formatCurrency";
import type { BoardCard } from "./dealRepo";
import { useInlineEdit } from "./useInlineEdit";

// Server caps a deal title at 255 chars; the inline editor rejects anything longer client-side.
const MAX_TITLE_LEN = 255;

export interface DealListStage {
  id: string;
  name: string;
}

// DealListRow replaces updatedAt with a serialised ISO string so it can be
// passed over the server/client boundary (Date is not serialisable as JSON).
export interface DealListRow extends Omit<BoardCard, "updatedAt"> {
  updatedAt: string;
}

export interface DealListProps {
  pipelineId: string;
  rows: DealListRow[];
  total: number;
  totalValue: string;
  stages: DealListStage[];
  // Resolves true when the move actually landed, false when it failed. DealList clears the row
  // selection only on true, so a failed move keeps the selection instead of falsely signalling
  // success (the selection vanishing was read as "it worked" even when the server rejected it).
  onBulkStage: (dealIds: string[], toStageId: string) => Promise<boolean>;
  // Ordered visible columns (from useColumns/DEAL_LIST_COLUMNS). Title is always first (pinned).
  visibleColumns: readonly ColumnDef[];
  // The Customize-columns cog, rendered by the stateful client above the table.
  columnsMenu?: React.ReactNode;
  // Present only on the Archive view: renders a per-row Unarchive control. When set the table
  // grows a trailing actions column; the normal list passes nothing and stays unchanged.
  onUnarchive?: (dealId: string) => void;
}

// Short activity date, tolerant of a Date or a serialized string crossing the SSR boundary.
function fmtDate(d: Date | string | null): string {
  if (d === null) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Expected close is a date-only column (YYYY-MM-DD). Parse the parts as a LOCAL date so a
// browser in a negative-UTC timezone does not render the previous day (new Date("2026-08-01")
// is parsed as UTC midnight, which would shift back a day west of Greenwich).
function fmtDateOnly(d: string | null | undefined): string {
  if (d === null || d === undefined || d === "") return "";
  const parts = d.split("-");
  if (parts.length !== 3) return "";
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day)) return "";
  return new Date(y, m - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function DealList(props: DealListProps) {
  const { pipelineId, rows, total, totalValue, stages, onBulkStage, onUnarchive } = props;
  const { visibleColumns, columnsMenu } = props;
  const { editCell } = useInlineEdit(pipelineId);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Which row's title is in inline-edit mode. Pipedrive opens the deal on title
  // click, so edit is behind an explicit control rather than the cell itself.
  const [editingId, setEditingId] = useState<string | null>(null);

  function saveTitle(row: DealListRow, value: string) {
    setEditingId(null);
    const next = value.trim();
    // Reject empty/whitespace (would blank the deal name) and over-long (server caps title at 255).
    if (next === "" || next === row.title || next.length > MAX_TITLE_LEN) return;
    editCell({ dealId: row.id, field: "title", value: next, expectedUpdatedAt: row.updatedAt });
  }

  // Map stage id -> human name so the table shows the stage, not a raw uuid.
  const stageNameById = new Map(stages.map((s) => [s.id, s.name]));

  const allIds = rows.map((r) => r.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0 && !allSelected;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }

  async function handleBulkStage(toStageId: string): Promise<void> {
    if (!toStageId) return;
    // Clear the selection only once the move actually lands. A failed move keeps the selection so
    // the vanishing rows don't read as success (the whole point of the fix).
    const applied = await onBulkStage([...selected], toStageId);
    if (applied) setSelected(new Set());
  }

  // Per-column td content. Title is interactive (inline edit); the rest are read cells resolved by
  // key so a customized/reordered column set renders without a fixed column list.
  function renderCell(key: string, row: DealListRow): React.ReactNode {
    switch (key) {
      case "title":
        return editingId === row.id ? (
          <input
            // biome-ignore lint/a11y/noAutofocus: focus follows the explicit edit click
            autoFocus
            aria-label="Edit title"
            maxLength={MAX_TITLE_LEN}
            defaultValue={row.title}
            className="w-full rounded border px-1 py-0.5 text-sm"
            onBlur={(e) => saveTitle(row, e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditingId(null);
            }}
          />
        ) : (
          <span className="group flex items-center gap-2">
            <Link href={`/deals/${row.id}`} className="text-primary hover:underline">
              {row.title}
            </Link>
            <button
              type="button"
              aria-label="Edit title"
              onClick={() => setEditingId(row.id)}
              className="text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
            >
              Edit
            </button>
          </span>
        );
      case "org":
        return row.orgId !== null && (row.orgName ?? null) !== null ? (
          <Link href={`/contacts/orgs/${row.orgId}`} className="text-primary hover:underline">
            {row.orgName}
          </Link>
        ) : (
          (row.orgName ?? "")
        );
      case "value":
        return row.value !== null ? formatCurrency(row.value) : "";
      case "stage":
        return stageNameById.get(row.stageId) ?? row.stageId;
      case "owner":
        return (row.ownerName ?? null) !== null ? (
          <span className="flex items-center gap-2">
            <Avatar name={row.ownerName ?? ""} src={row.ownerAvatarUrl} className="h-6 w-6" />
            {row.ownerName}
          </span>
        ) : (
          ""
        );
      case "person":
        return row.personName ?? "";
      case "expectedCloseDate":
        return fmtDateOnly(row.expectedCloseDate);
      case "nextActivity":
        return fmtDate(row.nextActivityAt);
      default:
        return "";
    }
  }

  function cellClass(key: string): string {
    if (key === "title") return "px-3 py-2 font-semibold";
    if (key === "value") return "px-3 py-2 tabular-nums text-foreground";
    return "px-3 py-2 text-muted-foreground";
  }

  const bodyColSpan = 1 + visibleColumns.length + (onUnarchive ? 1 : 0);

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      {columnsMenu !== undefined ? (
        <div className="flex items-center justify-end border-b px-3 py-1.5">{columnsMenu}</div>
      ) : null}
      {selected.size > 0 ? (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="flex items-center gap-3 border-b bg-accent px-4 py-2"
        >
          <span className="text-sm font-medium tabular-nums text-accent-foreground">
            {selected.size} selected
          </span>
          <Select
            ariaLabel="Move to stage"
            value=""
            onChange={(v) => void handleBulkStage(v)}
            placeholder="Move to stage..."
            options={stages.map<SelectOption>((s) => ({ value: s.id, label: s.name }))}
          />
        </div>
      ) : null}

      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Deals list</caption>
        <thead>
          <tr className="border-b bg-muted/60 text-left text-muted-foreground">
            <th scope="col" className="w-10 px-3 py-2">
              <Checkbox
                label="Select all deals"
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={toggleAll}
              />
            </th>
            {visibleColumns.map((col) => (
              <th key={col.key} scope="col" className="px-3 py-2 font-semibold">
                {col.header}
              </th>
            ))}
            {onUnarchive ? (
              <th scope="col" className="px-3 py-2 font-semibold">
                Actions
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={`border-b last:border-0 hover:bg-muted/50 ${selected.has(row.id) ? "bg-accent/50" : ""}`}
            >
              <td className="w-10 px-3 py-2">
                <Checkbox
                  label={`Select ${row.title}`}
                  checked={selected.has(row.id)}
                  onCheckedChange={() => toggleOne(row.id)}
                />
              </td>
              {visibleColumns.map((col) => (
                <td key={col.key} className={cellClass(col.key)}>
                  {renderCell(col.key, row)}
                </td>
              ))}
              {onUnarchive ? (
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onUnarchive(row.id)}
                    className="rounded border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    Unarchive
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/60 font-medium text-foreground">
            <td colSpan={bodyColSpan} className="px-3 py-2 tabular-nums">
              {total} {total === 1 ? "deal" : "deals"} &middot; total value{" "}
              {formatCurrency(totalValue)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
