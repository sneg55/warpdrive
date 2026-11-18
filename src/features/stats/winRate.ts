import type { MoneyBucket } from "@/types/stats";

export function winRate(won: MoneyBucket, lost: MoneyBucket): number | null {
  const closed = won.count + lost.count;
  if (closed === 0) return null;
  return won.count / closed;
}
