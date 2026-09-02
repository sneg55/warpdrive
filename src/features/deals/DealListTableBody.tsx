"use client";

import Link from "next/link";
import type React from "react";
import { CustomFieldCell, customFieldCellClass } from "@/components/data-table/CustomFieldCell";
import type { ColumnDef } from "@/components/data-table/columnModel";
import { Avatar } from "@/components/ui/Avatar";
import { Checkbox } from "@/components/ui/Checkbox";
import { formatCurrency } from "@/lib/formatCurrency";
import { DealTitleCell } from "./DealTitleCell";
import { fmtDate, fmtDateOnly } from "./dealListFormat";
import type { DealListRow } from "./dealListTypes";

interface RenderWindow {
  visible: DealListRow[];
  hasMore: boolean;
  remaining: number;
  showMore: () => void;
}

interface DealListTableBodyProps {
  rowWindow: RenderWindow;
  rowCount: number;
  visibleColumns: readonly ColumnDef[];
  colSpan: number;
  selected: Set<string>;
  onToggleRow: (id: string) => void;
  stageNameById: Map<string, string>;
  editingId: string | null;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onCommitTitle: (row: DealListRow, value: string) => void;
  onUnarchive?: (dealId: string) => void;
  empty?: React.ReactNode;
  currency: string;
}

function cellClass(col: ColumnDef): string {
  if (col.customField !== undefined) return customFieldCellClass(col.customField);
  if (col.key === "title") return "px-3 py-2 font-semibold";
  if (col.key === "value") return "px-3 py-2 tabular-nums text-foreground";
  return "px-3 py-2 text-muted-foreground";
}

export function DealListTableBody(props: DealListTableBodyProps): React.ReactNode {
  const { rowWindow, rowCount, visibleColumns, colSpan, selected, onToggleRow } = props;
  const { stageNameById, editingId, onStartEdit, onCancelEdit, onCommitTitle, currency } = props;
  const { onUnarchive, empty } = props;

  function renderCell(col: ColumnDef, row: DealListRow): React.ReactNode {
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
      case "title":
        return (
          <DealTitleCell
            dealId={row.id}
            title={row.title}
            editing={editingId === row.id}
            onStartEdit={() => onStartEdit(row.id)}
            onCancelEdit={onCancelEdit}
            onCommit={(value) => onCommitTitle(row, value)}
          />
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

  return (
    <tbody>
      {rowWindow.visible.map((row) => (
        <tr
          key={row.id}
          className={`border-b last:border-0 hover:bg-muted/50 ${selected.has(row.id) ? "bg-accent/50" : ""}`}
        >
          <td className="w-10 px-3 py-2">
            <Checkbox
              label={`Select ${row.title}`}
              checked={selected.has(row.id)}
              onCheckedChange={() => onToggleRow(row.id)}
            />
          </td>
          {visibleColumns.map((col) => (
            <td key={col.key} className={cellClass(col)}>
              {renderCell(col, row)}
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
      {rowCount === 0 && empty !== undefined ? (
        <tr>
          <td colSpan={colSpan}>{empty}</td>
        </tr>
      ) : null}
      {rowWindow.hasMore ? (
        <tr>
          <td colSpan={colSpan} className="px-3 py-3 text-center">
            <button
              type="button"
              onClick={rowWindow.showMore}
              className="rounded-md border px-4 py-1.5 text-sm transition-transform hover:bg-accent active:scale-[0.96]"
            >
              Show more ({rowWindow.remaining} more)
            </button>
          </td>
        </tr>
      ) : null}
    </tbody>
  );
}
