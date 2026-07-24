"use client";
import type React from "react";
import type { ColumnSort } from "@/components/data-table/useColumnSort";
import { Avatar } from "@/components/ui/Avatar";
import { Checkbox } from "@/components/ui/Checkbox";
import { RecordLink } from "@/features/navigation/RecordLink";
import type { OrgColumn } from "./orgColumns";
import type { OrgSortField } from "./schemas";

export interface OrgsListRow {
  id: string;
  name: string;
  address: Record<string, unknown> | null;
  peopleCount: number;
  closedDeals: number;
  openDeals: number;
}

// Compact one-line address for the list row (e.g. "Austin, US"), not the full structured
// address (street/region/postal/coords) shown on the org detail page.
function formatAddress(address: Record<string, unknown> | null): string {
  if (address === null) return "";
  const parts = [address.city, address.country].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  return parts.join(", ");
}

export interface OrgsTableProps {
  rows: OrgsListRow[];
  sort: ColumnSort<OrgSortField>;
  onSort: (field: OrgSortField) => void;
  isSelected: (id: string) => boolean;
  allSelected: boolean;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  visibleColumns: readonly OrgColumn[];
  columnsMenu?: React.ReactNode;
}

function SortGlyph({ dir }: { dir: "asc" | "desc" | null }): React.ReactNode {
  if (dir === null) return null;
  return (
    <span aria-hidden="true" className="ml-1 inline-block text-[10px]">
      {dir === "asc" ? "▲" : "▼"}
    </span>
  );
}

function SortableHeader({
  field,
  label,
  sort,
  onSort,
}: {
  field: OrgSortField;
  label: string;
  sort: ColumnSort<OrgSortField>;
  onSort: (field: OrgSortField) => void;
}): React.ReactNode {
  return (
    <th className="px-3 py-2 font-semibold">
      <button
        type="button"
        onClick={() => onSort(field)}
        className="inline-flex items-center font-semibold hover:text-foreground"
      >
        {label}
        {/* eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- OrgSortField
            has only one member today; kept generic (matching PeopleTable's two-field version)
            for when a second sortable Organizations column is added. */}
        <SortGlyph dir={sort.field === field ? sort.dir : null} />
      </button>
    </th>
  );
}

// Presentational organizations table: header select-all + a sortable Name header, and a
// per-row checkbox. Extracted from OrgsList (the data/fetch container) to keep both files
// under the project's file-size budget, mirroring PeopleTable/PeopleList.
function renderOrgCell(key: string, row: OrgsListRow): React.ReactNode {
  switch (key) {
    case "name":
      return (
        <RecordLink
          href={`/contacts/orgs/${row.id}`}
          preview={{ id: row.id, title: row.name }}
          className="flex items-center gap-2.5 font-medium text-primary hover:underline"
        >
          <Avatar name={row.name} className="h-6 w-6 rounded-md" />
          {row.name}
        </RecordLink>
      );
    case "address":
      return formatAddress(row.address);
    case "peopleCount":
      return row.peopleCount;
    case "closedDeals":
      return row.closedDeals;
    case "openDeals":
      return row.openDeals;
    default:
      return "";
  }
}

function cellClass(key: string): string {
  if (key === "peopleCount" || key === "closedDeals" || key === "openDeals") {
    return "px-3 py-2 tabular-nums text-muted-foreground";
  }
  if (key === "name") return "px-3 py-2";
  return "px-3 py-2 text-muted-foreground";
}

export function OrgsTable({
  rows,
  sort,
  onSort,
  isSelected,
  allSelected,
  onToggleRow,
  onToggleAll,
  visibleColumns,
  columnsMenu,
}: OrgsTableProps): React.ReactNode {
  return (
    <div className="overflow-hidden">
      {columnsMenu !== undefined ? (
        <div className="flex items-center justify-end pb-1.5">{columnsMenu}</div>
      ) : null}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/60 text-left text-muted-foreground">
            <th className="w-8 px-3 py-2">
              <Checkbox
                label="Select all organizations"
                checked={allSelected}
                onCheckedChange={onToggleAll}
              />
            </th>
            {visibleColumns.map((col) =>
              col.sortField !== undefined ? (
                <SortableHeader
                  key={col.key}
                  field={col.sortField}
                  label={col.header}
                  sort={sort}
                  onSort={onSort}
                />
              ) : (
                <th key={col.key} className="px-3 py-2 font-semibold">
                  {col.header}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b last:border-0 hover:bg-muted/50">
              <td className="px-3 py-2">
                <Checkbox
                  label={`Select ${row.name}`}
                  checked={isSelected(row.id)}
                  onCheckedChange={() => onToggleRow(row.id)}
                />
              </td>
              {visibleColumns.map((col) => (
                <td key={col.key} className={cellClass(col.key)}>
                  {renderOrgCell(col.key, row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
