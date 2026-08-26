import type { MoneyBucket } from "@/types/stats";

// Won share of everything that closed in the period. Open deals never enter the
// denominator: a pipeline full of untouched deals must not drag the rate down.
// Null (not 0) when nothing closed, so "lost every deal" and "closed nothing" stay
// distinguishable in the UI.
export function winRate(won: MoneyBucket, lost: MoneyBucket): number | null {
  const closed = won.count + lost.count;
  if (closed === 0) return null;
  return won.count / closed;
}
