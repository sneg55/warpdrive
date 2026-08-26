// j/k row cursor arithmetic. Clamps rather than wraps: holding j should stop at the bottom of the
// list, not silently jump back to the top.

export function nextCursorIndex(
  current: number | null,
  count: number,
  delta: 1 | -1,
): number | null {
  if (count <= 0) return null;
  if (current === null) return delta === 1 ? 0 : count - 1;
  return Math.min(count - 1, Math.max(0, current + delta));
}
