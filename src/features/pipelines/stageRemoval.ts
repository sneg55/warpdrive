export interface RemovableStage {
  key: string;
  id: string | null;
  name: string;
  dealCount: number;
}

export interface StageDestination {
  id: string;
  name: string;
}

export function savedStagesExcept<T extends RemovableStage>(
  rows: T[],
  excludedKey: string,
): StageDestination[] {
  const out: StageDestination[] = [];
  for (const r of rows) {
    if (r.id === null || r.key === excludedKey) continue;
    out.push({ id: r.id, name: r.name });
  }
  return out;
}

export function nearestSavedStage<T extends RemovableStage>(
  rows: T[],
  index: number,
): string | null {
  for (let i = index + 1; i < rows.length; i += 1) {
    const id = rows[i]?.id;
    if (id != null) return id;
  }
  for (let i = index - 1; i >= 0; i -= 1) {
    const id = rows[i]?.id;
    if (id != null) return id;
  }
  return null;
}

export function insertRowAt<T>(rows: T[], index: number, row: T): T[] {
  const at = Math.min(Math.max(index, 0), rows.length);
  return [...rows.slice(0, at), row, ...rows.slice(at)];
}

export interface RowNeighbours {
  prevKey: string | null;
  nextKey: string | null;
}

export function insertRowBeside<T extends { key: string }>(
  rows: T[],
  row: T,
  neighbours: RowNeighbours,
): T[] {
  const prevAt = rows.findIndex((r) => r.key === neighbours.prevKey);
  if (prevAt >= 0) return insertRowAt(rows, prevAt + 1, row);
  const nextAt = rows.findIndex((r) => r.key === neighbours.nextKey);
  if (nextAt >= 0) return insertRowAt(rows, nextAt, row);
  return neighbours.prevKey === null ? insertRowAt(rows, 0, row) : [...rows, row];
}

export interface DealCounts {
  dealCount: number;
  closedDealCount: number;
}

interface PendingMove {
  stageId: string;
  moveDealsToStageId?: string;
}

export function incomingDealCounts(
  pendingDeletes: PendingMove[],
  removedById: Record<string, DealCounts>,
): Record<string, DealCounts> {
  const incoming: Record<string, DealCounts> = {};
  for (const op of pendingDeletes) {
    const source = removedById[op.stageId];
    if (op.moveDealsToStageId === undefined || source === undefined) continue;
    const carried = incoming[op.stageId] ?? { dealCount: 0, closedDealCount: 0 };
    const current = incoming[op.moveDealsToStageId] ?? { dealCount: 0, closedDealCount: 0 };
    incoming[op.moveDealsToStageId] = {
      dealCount: current.dealCount + source.dealCount + carried.dealCount,
      closedDealCount: current.closedDealCount + source.closedDealCount + carried.closedDealCount,
    };
  }
  return incoming;
}

export function dealCountLabel(total: number, closed: number): string {
  if (total === 0) return "No deals";
  const deals = total === 1 ? "1 deal" : `${total} deals`;
  return closed > 0 ? `${deals}, ${closed} won or lost` : deals;
}
