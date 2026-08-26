import { STRINGS } from "@/constants/strings";
import type { ActivityCounters, DealCounters, WonDealStats } from "@/types/stats";
import { durationDays, money } from "./Panel";

// Pipedrive's scoreboard view: the handful of numbers a manager reads first, above the charts.
// A metric with no data renders a dash, never a zero. "Nobody closed anything" and "everybody
// lost" must not look identical.
function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-medium tabular-nums">{value}</p>
    </div>
  );
}

function percent(v: number | null): string {
  return v === null ? STRINGS.dashboard.noValue : `${Math.round(v * 100)}%`;
}

export function Scoreboard({
  deals,
  won,
  activities,
  winRate,
  currency,
}: {
  deals: DealCounters;
  won: WonDealStats;
  activities: ActivityCounters;
  winRate: number | null;
  currency: string;
}) {
  const cycle =
    won.medianCycleDays === null ? STRINGS.dashboard.noValue : durationDays(won.medianCycleDays);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Tile label={STRINGS.dashboard.scoreWon} value={String(deals.won.count)} />
      <Tile label={STRINGS.dashboard.scoreWinRate} value={percent(winRate)} />
      <Tile
        label={STRINGS.dashboard.scoreAvgDeal}
        value={won.avgValue === null ? STRINGS.dashboard.noValue : money(won.avgValue, currency)}
      />
      <Tile label={STRINGS.dashboard.scoreCycle} value={cycle} />
      <Tile label={STRINGS.dashboard.scoreActivities} value={String(activities.completed)} />
    </div>
  );
}
