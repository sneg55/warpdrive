"use client";
import type React from "react";
import { CustomFieldCell, customFieldCellClass } from "@/components/data-table/CustomFieldCell";
import type { ColumnSort } from "@/components/data-table/useColumnSort";
import { Avatar } from "@/components/ui/Avatar";
import { Checkbox } from "@/components/ui/Checkbox";
import { useInterfacePrefs } from "@/features/identity/InterfacePrefsProvider";
import { RecordLink } from "@/features/navigation/RecordLink";
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
  closedDeals: number;
  customFields: Record<string, unknown>;
}

export interface RawPersonRow {
  id: string;
  name: string;
  primaryEmail: string | null;
  phones: { value: string; primary?: boolean }[];
  orgId: string | null;
  closedDeals: number;
  customFields: Record<string, unknown>;
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
    customFields: raw.customFields,
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
  visibleColumns: readonly PeopleColumn[];
  columnsMenu?: React.ReactNode;
  currency: string;
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

function renderPersonCell(
  col: PeopleColumn,
  row: PeopleListRow,
  usPhoneFormat: boolean,
  currency: string,
): React.ReactNode {
  if (col.customField !== undefined) {
    return (
      <CustomFieldCell
        def={col.customField}
        value={row.customFields[col.customField.key]}
        currency={currency}
      />
    );
  }
  switch (col.key) {
    case "name":
      return (
        <span className="flex items-center gap-2.5 font-medium">
          <Avatar name={row.name} className="h-6 w-6" />
          <RecordLink
            href={`/contacts/people/${row.id}`}
            preview={
              row.orgName !== null
                ? { id: row.id, title: row.name, subtitle: row.orgName }
                : { id: row.id, title: row.name }
            }
            className="text-primary hover:underline"
          >
            {row.name}
          </RecordLink>
        </span>
      );
    case "org":
      return row.orgId !== null && (row.orgName ?? null) !== null ? (
        <RecordLink
          href={`/contacts/orgs/${row.orgId}`}
          preview={{ id: row.orgId, title: row.orgName ?? "" }}
          className="text-primary hover:underline"
        >
          {row.orgName}
        </RecordLink>
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

function cellClass(col: PeopleColumn): string {
  if (col.customField !== undefined) return customFieldCellClass(col.customField);
  if (col.key === "phone" || col.key === "closedDeals")
    return "px-3 py-2 tabular-nums text-muted-foreground";
  if (col.key === "name") return "px-3 py-2";
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
  currency,
}: PeopleTableProps): React.ReactNode {
  const { usPhoneFormat } = useInterfacePrefs();
  return (
    <div className="overflow-hidden">
      {columnsMenu !== undefined ? (
        <div className="flex items-center justify-end pb-1.5">{columnsMenu}</div>
      ) : null}
      <div className="overflow-x-auto">
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
                  <td key={col.key} className={cellClass(col)}>
                    {renderPersonCell(col, row, usPhoneFormat, currency)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
