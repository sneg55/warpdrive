"use client";
import type React from "react";
import { customFieldCellClass } from "@/components/data-table/CustomFieldCell";
import { Checkbox } from "@/components/ui/Checkbox";
import { type RecordPreview, useRecordPreview } from "@/features/navigation/recordPreviewStore";
import type { LeadRow } from "../leadRepo";
import type { LeadSortField } from "../schemas";
import type { LeadColumn } from "./columns";
import { LeadCell } from "./LeadCell";
import { SourceOriginInfo } from "./SourceOriginInfo";
import type { LeadSort } from "./useLeadSort";

function leadPreview(row: LeadRow): RecordPreview {
  const subtitle = row.personName ?? row.orgName;
  return subtitle !== null
    ? { id: row.id, title: row.title, subtitle }
    : { id: row.id, title: row.title };
}

export interface LeadsTableProps {
  rows: LeadRow[];
  columns: LeadColumn[];
  now: Date | null;
  currency: string;
  empty: React.ReactNode;
  sort: LeadSort;
  onSort: (field: LeadSortField) => void;
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
  empty,
  sort,
  onSort,
  isSelected,
  allSelected,
  onToggleRow,
  onToggleAll,
  onOpen,
  renderRowActions,
}: LeadsTableProps): React.ReactNode {
  const setPreview = useRecordPreview((s) => s.setPreview);
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
              {col.sortField !== undefined ? (
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
            <td colSpan={colSpan} className="px-3">
              {empty}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr
              key={row.id}
              onMouseEnter={() => setPreview(leadPreview(row))}
              onClick={() => {
                setPreview(leadPreview(row));
                onOpen(row.id);
              }}
              className="cursor-pointer border-t hover:bg-accent/40"
            >
              <td className="px-3 py-2">
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
                <td
                  key={col.key}
                  className={col.customField ? customFieldCellClass(col.customField) : "px-3 py-2"}
                >
                  <LeadCell column={col} row={row} now={now} currency={currency} />
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
