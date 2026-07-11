"use client";
import type React from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import type { LeadRow } from "../leadRepo";
import type { LeadSortField } from "../schemas";
import type { LeadColumn } from "./columns";
import { LeadCell } from "./LeadCell";
import { SourceOriginInfo } from "./SourceOriginInfo";
import type { LeadSort } from "./useLeadSort";

export interface LeadsTableProps {
  rows: LeadRow[];
  columns: LeadColumn[];
  now: Date | null;
  currency: string;
  emptyLabel: string;
  sort: LeadSort;
  onSort: (field: LeadSortField) => void;
  // Selection.
  isSelected: (id: string) => boolean;
  allSelected: boolean;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (id: string) => void;
  renderRowActions: (row: LeadRow) => React.ReactNode;
}

function SortGlyph({ dir }: { dir: "asc" | "desc" | null }): React.ReactNode {
  if (dir === null) return null;
  return (
    <span aria-hidden="true" className="ml-1 inline-block text-[10px]">
      {dir === "asc" ? "▲" : "▼"}
    </span>
  );
}

export function LeadsTable({
  rows,
  columns,
  now,
  currency,
  emptyLabel,
  sort,
  onSort,
  isSelected,
  allSelected,
  onToggleRow,
  onToggleAll,
  onOpen,
  renderRowActions,
}: LeadsTableProps): React.ReactNode {
  const colSpan = columns.length + 2;
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-muted/60 text-left text-xs uppercase text-muted-foreground">
        <tr>
          <th className="w-8 px-3 py-2">
            <Checkbox
              label="Select all leads"
              checked={allSelected}
              onCheckedChange={onToggleAll}
            />
          </th>
          {columns.map((col) => (
            <th key={col.key} className="px-3 py-2 font-semibold">
              {col.sortField !== null ? (
                <button
                  type="button"
                  onClick={() => onSort(col.sortField as LeadSortField)}
                  className="inline-flex items-center uppercase hover:text-foreground"
                >
                  {col.header}
                  <SortGlyph dir={sort.field === col.sortField ? sort.dir : null} />
                </button>
              ) : (
                col.header
              )}
              {col.key === "sourceOrigin" && <SourceOriginInfo />}
            </th>
          ))}
          <th className="px-3 py-2 font-semibold sr-only">Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={colSpan} className="px-3 py-10 text-center text-muted-foreground">
              {emptyLabel}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onOpen(row.id)}
              className="cursor-pointer border-t hover:bg-accent/40"
            >
              <td className="px-3 py-2">
                {/* Stop the row's open-detail onClick from firing when toggling selection. */}
                {/* biome-ignore lint/a11y/noStaticElementInteractions: wrapper only guards event bubbling */}
                {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard toggling is handled by the Checkbox itself */}
                <span onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    label={`Select ${row.title}`}
                    checked={isSelected(row.id)}
                    onCheckedChange={() => onToggleRow(row.id)}
                  />
                </span>
              </td>
              {columns.map((col) => (
                <td key={col.key} className="px-3 py-2">
                  <LeadCell columnKey={col.key} row={row} now={now} currency={currency} />
                </td>
              ))}
              <td className="px-3 py-2 text-right">{renderRowActions(row)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
