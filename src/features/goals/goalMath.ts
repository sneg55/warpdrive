// Attainment and pace. Both take decimal strings so money survives from numeric(14,2)
// without a float in the middle of the round trip.

// Booked over target, uncapped: 120% of quota must read as 120%, not as a full bar.
// Null on a zero target, which the boundary rejects, so reaching it means corrupt data and
// Infinity is not something to render as a percentage.
export function attainment(actual: string, target: string): number | null {
  const t = Number(target);
  if (t === 0 || Number.isNaN(t)) return null;
  return Number(actual) / t;
}

// Attainment relative to how much of the period is gone: 1 means exactly on track, above
// means ahead. Null before any time has elapsed, since nothing can be on or off track yet.
export function pace(attained: number | null, elapsed: number): number | null {
  if (attained === null || elapsed <= 0) return null;
  return attained / elapsed;
}
