"use client";

import type React from "react";
import { useState } from "react";
import type { ColumnDef } from "@/components/data-table/columnModel";
import { RENDER_WINDOW_STEP, useRenderWindow } from "@/components/data-table/useRenderWindow";
import { Checkbox } from "@/components/ui/Checkbox";
import { formatCurrency } from "@/lib/formatCurrency";
import { DealListBulkBar } from "./DealListBulkBar";
import { DealListTableBody } from "./DealListTableBody";
import { MAX_TITLE_LEN } from "./DealTitleCell";
import type { DealListRow, DealListStage } from "./dealListTypes";
import { useInlineEdit } from "./useInlineEdit";

export type { DealListRow, DealListStage } from "./dealListTypes";

export interface DealListProps {
  pipelineId: string;
  rows: DealListRow[];
  total: number;
  totalValue: string;
  stages: DealListStage[];
  onBulkStage: (dealIds: string[], toStageId: string) => Promise<boolean>;
  onBulkArchive?: (dealIds: string[]) => Promise<boolean>;
  visibleColumns: readonly ColumnDef[];
  columnsMenu?: React.ReactNode;
  onUnarchive?: (dealId: string) => Promise<boolean>;
  empty?: React.ReactNode;
  filtered?: boolean;
  currency: string;
}

export function DealList(props: DealListProps) {
  const { pipelineId, rows, total, totalValue, stages, currency } = props;
  const { onBulkStage, onBulkArchive, onUnarchive } = props;
  const { visibleColumns, columnsMenu, empty, filtered = false } = props;
  const { editCell } = useInlineEdit(pipelineId);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const rowWindow = useRenderWindow(rows, RENDER_WINDOW_STEP);

  function saveTitle(row: DealListRow, value: string) {
    setEditingId(null);
    const next = value.trim();
    if (next === "" || next === row.title || next.length > MAX_TITLE_LEN) return;
    editCell({ dealId: row.id, field: "title", value: next, expectedUpdatedAt: row.updatedAt });
  }

  const stageNameById = new Map(stages.map((s) => [s.id, s.name]));

  const allIds = rows.map((r) => r.id);
  const selectedIds = allIds.filter((id) => selected.has(id));
  const allSelected = allIds.length > 0 && selectedIds.length === allIds.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

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

  function selectAllState(): boolean | "indeterminate" {
    if (allSelected) return true;
    return someSelected ? "indeterminate" : false;
  }

  async function confirmBulkStage(toStageId: string): Promise<void> {
    const applied = await onBulkStage(selectedIds, toStageId);
    if (applied) setSelected(new Set());
  }

  async function confirmBulkArchive(): Promise<void> {
    if (onBulkArchive === undefined) return;
    const applied = await onBulkArchive(selectedIds);
    if (applied) setSelected(new Set());
  }

  const bodyColSpan = 1 + visibleColumns.length + (onUnarchive ? 1 : 0);

  if (rows.length === 0 && empty !== undefined && !filtered) {
    return <div className="overflow-hidden rounded-lg border bg-card shadow-sm">{empty}</div>;
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      {columnsMenu !== undefined ? (
        <div className="flex items-center justify-end border-b px-3 py-1.5">{columnsMenu}</div>
      ) : null}
      {selectedIds.length > 0 ? (
        <DealListBulkBar
          count={selectedIds.length}
          stages={stages}
          onConfirmStage={confirmBulkStage}
          onConfirmArchive={onBulkArchive === undefined ? undefined : confirmBulkArchive}
        />
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Deals list</caption>
          <thead>
            <tr className="border-b bg-muted/60 text-left text-muted-foreground">
              <th scope="col" className="w-10 px-3 py-2">
                <Checkbox
                  label="Select all deals"
                  checked={selectAllState()}
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
          <DealListTableBody
            rowWindow={rowWindow}
            rowCount={rows.length}
            visibleColumns={visibleColumns}
            colSpan={bodyColSpan}
            selected={selected}
            onToggleRow={toggleOne}
            stageNameById={stageNameById}
            editingId={editingId}
            onStartEdit={setEditingId}
            onCancelEdit={() => setEditingId(null)}
            onCommitTitle={saveTitle}
            onUnarchive={onUnarchive}
            empty={empty}
            currency={currency}
          />
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
    </div>
  );
}
