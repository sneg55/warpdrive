// Pure index math for the up/down reorder buttons the catalog clients share. Returns a new
// ordered id array with the item at `index` swapped one slot in `dir`, or the same array
// (referentially unchanged is fine) when the move would fall off either end.
export function moveInArray<T>(items: readonly T[], index: number, dir: "up" | "down"): T[] {
  const target = dir === "up" ? index - 1 : index + 1;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return items.slice();
  }
  const next = items.slice();
  const a = next[index];
  const b = next[target];
  if (a === undefined || b === undefined) return next;
  next[index] = b;
  next[target] = a;
  return next;
}
