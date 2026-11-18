export function attainment(actual: string, target: string): number | null {
  const t = Number(target);
  if (t === 0 || Number.isNaN(t)) return null;
  return Number(actual) / t;
}

export function pace(attained: number | null, elapsed: number): number | null {
  if (attained === null || elapsed <= 0) return null;
  return attained / elapsed;
}
