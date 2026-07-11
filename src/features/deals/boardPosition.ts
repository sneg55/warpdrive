// Fractional rank for card order within a (pipeline, stage) column. A move sets the
// card to the midpoint of its two neighbors so only one row is written (data-model).
// Uses Number for the midpoint; precision is fine for board depths, and a maintenance
// job rebalances a column when precision runs low (out of Phase 2 scope).
export function midpoint(before: string | null, after: string | null): string {
  if (before === null && after === null) return "1";
  if (after === null) return String(Number(before) + 1);
  if (before === null) return String(Number(after) / 2);
  const mid = (Number(before) + Number(after)) / 2;
  return String(mid);
}
