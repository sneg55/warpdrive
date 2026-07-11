"use client";
import Link from "next/link";
import type React from "react";
import type { ColumnSort } from "@/components/data-table/useColumnSort";
import { Avatar } from "@/components/ui/Avatar";
import { Checkbox } from "@/components/ui/Checkbox";
import { useInterfacePrefs } from "@/features/identity/InterfacePrefsProvider";
import { formatUsPhone } from "@/utils/phone";
import type { PeopleColumn } from "./peopleColumns";
import type { PersonSortField } from "./schemas";

export interface PeopleListRow {
  id: string;
  name: string;
  primaryEmail: string | null;
  phone: string | null;
  orgId: string | null;
  orgName: string | null;
  // Won+lost deal count (Closed deals column); server-computed via a batched deal-count join.
  closedDeals: number;
}

// Raw persons.list row shape the load-more query returns (a subset of Person plus closedDeals).
export interface RawPersonRow {
  id: string;
  name: string;
  primaryEmail: string | null;
  phones: { value: string; primary?: boolean }[];
  orgId: string | null;
  closedDeals: number;
}

export function toRow(raw: RawPersonRow, orgNames: Record<string, string>): PeopleListRow {
  const phone = raw.phones.find((p) => p.primary === true)?.value ?? raw.phones[0]?.value ?? null;
  return {
    id: raw.id,
    name: raw.name,
    primaryEmail: raw.primaryEmail,
    phone,
    orgId: raw.orgId,
    orgName: raw.orgId !== null ? (orgNames[raw.orgId] ?? null) : null,
    closedDeals: raw.closedDeals,
  };
}

export interface PeopleTableProps {
  rows: PeopleListRow[];
  sort: ColumnSort<PersonSortField>;
  onSort: (field: PersonSortField) => void;
  isSelected: (id: string) => boolean;
  allSelected: boolean;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  // Ordered visible columns (Name pinned first) + the Customize-columns cog rendered by PeopleList.
  visibleColumns: readonly PeopleColumn[];
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
  field: PersonSortField;
  label: string;
  sort: ColumnSort<PersonSortField>;
  onSort: (field: PersonSortField) => void;
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

// Presentational people table: header select-all + sortable Name/Email headers, and a
// per-row checkbox. Extracted from PeopleList (the data/fetch container) to keep both files
// under the project's file-size budget, mirroring LeadsTable/LeadsInbox.
function renderPersonCell(
  key: string,
  row: PeopleListRow,
  usPhoneFormat: boolean,
): React.ReactNode {
  switch (key) {
    case "name":
      return (
        <span className="flex items-center gap-2.5 font-medium">
          <Avatar name={row.name} className="h-6 w-6" />
          <Link href={`/contacts/people/${row.id}`} className="text-primary hover:underline">
            {row.name}
          </Link>
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
    case "email":
      return row.primaryEmail ?? "";
    case "phone":
      return row.phone === null ? "" : usPhoneFormat ? formatUsPhone(row.phone) : row.phone;
    case "closedDeals":
      return row.closedDeals;
    default:
      return "";
  }
}

function cellClass(key: string): string {
  if (key === "phone" || key === "closedDeals")
    return "px-3 py-2 tabular-nums text-muted-foreground";
  if (key === "name") return "px-3 py-2";
  return "px-3 py-2 text-muted-foreground";
}

export function PeopleTable({
  rows,
  sort,
  onSort,
  isSelected,
  allSelected,
  onToggleRow,
  onToggleAll,
  visibleColumns,
  columnsMenu,
}: PeopleTableProps): React.ReactNode {
  const { usPhoneFormat } = useInterfacePrefs();
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
                label="Select all people"
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
                  {renderPersonCell(col.key, row, usPhoneFormat)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
