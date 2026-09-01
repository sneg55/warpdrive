import { arrayMove } from "@dnd-kit/sortable";
import type { StageRow } from "./stageDiff";

export function reorderRowsByKey<T extends { key: string }>(
  rows: readonly T[],
  activeKey: string,
  overKey: string,
): T[] {
  if (activeKey === overKey) return rows.slice();
  const from = rows.findIndex((r) => r.key === activeKey);
  const to = rows.findIndex((r) => r.key === overKey);
  if (from === -1 || to === -1) return rows.slice();
  return arrayMove(rows.slice(), from, to);
}

export function stageOrderChanged(
  originalIds: readonly string[],
  rows: readonly StageRow[],
): boolean {
  const present = new Set(rows.map((r) => r.id).filter((id): id is string => id !== null));
  const natural: (string | null)[] = originalIds.filter((id) => present.has(id));
  while (natural.length < rows.length) natural.push(null);
  return rows.some((r, i) => r.id !== natural[i]);
}

export function buildOrderedStageIds(
  rows: readonly StageRow[],
  createdIds: readonly string[],
): string[] {
  let next = 0;
  const out: string[] = [];
  for (const row of rows) {
    const id = row.id ?? createdIds[next++];
    if (id !== undefined) out.push(id);
  }
  return out;
}

export function assignCreatedIds<T extends StageRow>(
  rows: readonly T[],
  createdIds: readonly string[],
): T[] {
  let next = 0;
  return rows.map((row) => {
    if (row.id !== null) return row;
    const id = createdIds[next++];
    return id === undefined ? row : { ...row, id };
  });
}
