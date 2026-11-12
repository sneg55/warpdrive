import Link from "next/link";
import { STRINGS } from "@/constants/strings";
import type { ActivityCounters, DealCounters, WonDealStats } from "@/types/stats";
import {
  buildCompletedActivitiesHref,
  buildWonDealsHref,
  type DrillDownSource,
} from "../drillDownHref";
import { durationDays, money } from "./Panel";

const TILE_CLASS = "block rounded-lg border p-4";
const LINKED_TILE_CLASS = `${TILE_CLASS} transition-colors hover:border-foreground/30 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`;

function TileBody({ label, value }: { label: string; value: string }) {
  return (
    <>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-medium tabular-nums">{value}</p>
    </>
  );
}

function Tile({
  label,
  value,
  href = null,
}: {
  label: string;
  value: string;
  href?: string | null;
}) {
  if (href === null) {
    return (
      <div className={TILE_CLASS}>
        <TileBody label={label} value={value} />
      </div>
    );
  }
  return (
    <Link href={href} className={LINKED_TILE_CLASS}>
      <TileBody label={label} value={value} />
    </Link>
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
  drillDown,
}: {
  deals: DealCounters;
  won: WonDealStats;
  activities: ActivityCounters;
  winRate: number | null;
  currency: string;
  drillDown: DrillDownSource;
}) {
  const cycle =
    won.medianCycleDays === null ? STRINGS.dashboard.noValue : durationDays(won.medianCycleDays);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Tile
        label={STRINGS.dashboard.scoreWon}
        value={String(deals.won.count)}
        href={buildWonDealsHref(drillDown)}
      />
      <Tile label={STRINGS.dashboard.scoreWinRate} value={percent(winRate)} />
      <Tile
        label={STRINGS.dashboard.scoreAvgDeal}
        value={won.avgValue === null ? STRINGS.dashboard.noValue : money(won.avgValue, currency)}
      />
      <Tile label={STRINGS.dashboard.scoreCycle} value={cycle} />
      <Tile
        label={STRINGS.dashboard.scoreActivities}
        value={String(activities.completed)}
        href={buildCompletedActivitiesHref(drillDown)}
      />
    </div>
  );
}
