"use client";
import { type Dispatch, type SetStateAction, useState } from "react";
import { STRINGS } from "@/constants/strings";
import type { StageDeleteRequest } from "./StageDeleteDialog";
import type { StageDeleteOp, StageRow } from "./stageDiff";
import { STAGE_DELETE_FAILURE_REASON, STAGE_EDIT_ERROR_MESSAGE } from "./stageEditMessages";
import {
  type DealCounts,
  incomingDealCounts,
  insertRowBeside,
  nearestSavedStage,
  type RowNeighbours,
  savedStagesExcept,
} from "./stageRemoval";

export type EditorRow = StageRow & { key: string; dealCount: number; closedDealCount: number };

interface RemovedRow {
  row: EditorRow;
  neighbours: RowNeighbours;
}

interface UseStageDeletionArgs {
  rows: EditorRow[];
  setRows: Dispatch<SetStateAction<EditorRow[]>>;
  setError: (message: string) => void;
}

export interface StageDeletion {
  pendingDeletes: StageDeleteOp[];
  request: StageDeleteRequest | null;
  rowsWithIncoming: EditorRow[];
  remove: (idx: number) => void;
  confirm: (moveDealsToStageId: string) => void;
  cancel: () => void;
  reconcile: (outcome: SaveOutcome) => void;
  restoredFailed: (stageId: string) => boolean;
}

export interface SaveOutcome {
  settled: string[];
  failed?: { stageId: string; errorId: string };
}

export function useStageDeletion({ rows, setRows, setError }: UseStageDeletionArgs): StageDeletion {
  const [pendingDeletes, setPendingDeletes] = useState<StageDeleteOp[]>([]);
  const [request, setRequest] = useState<StageDeleteRequest | null>(null);
  const [removed, setRemoved] = useState<Record<string, RemovedRow>>({});

  const removedCounts = Object.fromEntries(
    Object.entries(removed).map(([id, r]) => [
      id,
      { dealCount: r.row.dealCount, closedDealCount: r.row.closedDealCount },
    ]),
  );
  const incoming = incomingDealCounts(pendingDeletes, removedCounts);
  const rowsWithIncoming = rows.map((r) =>
    addCounts(r, r.id === null ? undefined : incoming[r.id]),
  );

  function commitRemove(row: EditorRow, idx: number, moveDealsToStageId?: string): void {
    if (row.id !== null) {
      const stageId = row.id;
      const neighbours: RowNeighbours = {
        prevKey: rows[idx - 1]?.key ?? null,
        nextKey: rows[idx + 1]?.key ?? null,
      };
      setRemoved((prev) => ({ ...prev, [stageId]: { row, neighbours } }));
      setPendingDeletes((d) => [
        ...d,
        moveDealsToStageId === undefined ? { stageId } : { stageId, moveDealsToStageId },
      ]);
    }
    setRows((prev) => prev.filter((r) => r.key !== row.key));
  }

  function remove(idx: number): void {
    const row = rowsWithIncoming[idx];
    if (row === undefined) return;
    const defaultDestinationId = nearestSavedStage(rows, idx);
    if (row.id !== null && row.dealCount > 0 && defaultDestinationId !== null) {
      setRequest({
        key: row.key,
        name: row.name,
        dealCount: row.dealCount,
        closedDealCount: row.closedDealCount,
        destinations: savedStagesExcept(rows, row.key),
        defaultDestinationId,
      });
      return;
    }
    const underlying = rows[idx];
    if (underlying !== undefined) commitRemove(underlying, idx);
  }

  function confirm(moveDealsToStageId: string): void {
    const current = request;
    setRequest(null);
    if (current === null) return;
    const idx = rows.findIndex((r) => r.key === current.key);
    const row = rows[idx];
    if (row !== undefined) commitRemove(row, idx, moveDealsToStageId);
  }

  function reconcile(outcome: SaveOutcome): void {
    const settled = new Set(outcome.settled);
    const transferred = settledTransfers(pendingDeletes, settled, removedCounts, incoming);
    const failed = outcome.failed === undefined ? undefined : removed[outcome.failed.stageId];
    const gone = new Set(outcome.settled);
    if (outcome.failed !== undefined) gone.add(outcome.failed.stageId);
    setPendingDeletes((prev) => prev.filter((op) => !gone.has(op.stageId)));
    setRemoved((prev) =>
      Object.fromEntries(
        Object.entries(prev)
          .filter(([id]) => !gone.has(id))
          .map(([id, entry]) => [id, { ...entry, row: addCounts(entry.row, transferred[id]) }]),
      ),
    );
    setRows((prev) => {
      const next = prev.map((r) => addCounts(r, r.id === null ? undefined : transferred[r.id]));
      if (failed === undefined) return next;
      const restored = addCounts(failed.row, transferred[outcome.failed?.stageId ?? ""]);
      return insertRowBeside(next, restored, failed.neighbours);
    });
    if (outcome.failed !== undefined && failed !== undefined) {
      const { errorId } = outcome.failed;
      const reason =
        STAGE_DELETE_FAILURE_REASON[errorId] ?? STAGE_EDIT_ERROR_MESSAGE[errorId] ?? errorId;
      setError(STRINGS.settings.stageDeleteFailed(failed.row.name, reason));
    }
  }

  return {
    pendingDeletes,
    request,
    rowsWithIncoming,
    remove,
    confirm,
    cancel: () => setRequest(null),
    reconcile,
    restoredFailed: (stageId: string) => removed[stageId] !== undefined,
  };
}

function settledTransfers(
  pendingDeletes: StageDeleteOp[],
  settled: Set<string>,
  removedCounts: Record<string, DealCounts>,
  incoming: Record<string, DealCounts>,
): Record<string, DealCounts> {
  const transferred: Record<string, DealCounts> = {};
  for (const op of pendingDeletes) {
    const source = removedCounts[op.stageId];
    if (!settled.has(op.stageId) || op.moveDealsToStageId === undefined || source === undefined) {
      continue;
    }
    const carried = incoming[op.stageId] ?? { dealCount: 0, closedDealCount: 0 };
    const current = transferred[op.moveDealsToStageId] ?? { dealCount: 0, closedDealCount: 0 };
    transferred[op.moveDealsToStageId] = {
      dealCount: current.dealCount + source.dealCount + carried.dealCount,
      closedDealCount: current.closedDealCount + source.closedDealCount + carried.closedDealCount,
    };
  }
  return transferred;
}

function addCounts(row: EditorRow, extra: DealCounts | undefined): EditorRow {
  if (extra === undefined) return row;
  return {
    ...row,
    dealCount: row.dealCount + extra.dealCount,
    closedDealCount: row.closedDealCount + extra.closedDealCount,
  };
}
