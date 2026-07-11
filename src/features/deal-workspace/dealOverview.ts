const DAY = 86_400_000;

export interface DealOverview {
  ageDays: number; // days since the deal was created
  inactiveDays: number; // days since the last activity (falls back to age when never active)
}

// Pure overview metrics for the deal detail "Overview" section (Pipedrive: Deal age + Inactive
// days). inactiveDays measures staleness: time since the last logged activity, or the deal's full
// age if it never had one.
export function dealOverview(
  createdAt: Date,
  lastActivityAt: Date | null,
  now: Date,
): DealOverview {
  const ageDays = Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / DAY));
  const since = lastActivityAt ?? createdAt;
  const inactiveDays = Math.max(0, Math.floor((now.getTime() - since.getTime()) / DAY));
  return { ageDays, inactiveDays };
}
