import { STRINGS } from "@/constants/strings";
import type {
  ActivityCounters,
  DealCounters,
  OwnerScope,
  StageConversionRow,
  StageSum,
} from "@/types/stats";
import { Bar, durationDays, money, Panel } from "./Panel";

export function DealPerformanceWidget({
  data,
  currency,
}: {
  data: DealCounters;
  currency: string;
}) {
  // Added/won/lost are windowed by their own date column; "Open now" is a snapshot, so it is
  // labelled differently to stop it reading as a fourth measure of the same period.
  const rows: [string, { count: number; value: string }][] = [
    [STRINGS.dashboard.added, data.added],
    [STRINGS.dashboard.won, data.won],
    [STRINGS.dashboard.lost, data.lost],
    [STRINGS.dashboard.open, data.open],
  ];
  return (
    <Panel title={STRINGS.dashboard.widgetDealPerformance} isEmpty={false} emptyText="">
      {/* Both numeric columns are their own grid track, so counts and money each line up on a
          single right edge instead of floating wherever justify-between put them. */}
      {rows.map(([label, b]) => (
        <div key={label} className="grid grid-cols-[1fr_auto_auto] items-baseline gap-4 py-1">
          <span className="truncate">{label}</span>
          <span className="min-w-8 text-right tabular-nums text-muted-foreground">{b.count}</span>
          <span className="min-w-24 text-right font-medium tabular-nums text-foreground">
            {money(b.value, currency)}
          </span>
        </div>
      ))}
    </Panel>
  );
}

function funnelBasis(scope: OwnerScope): string {
  switch (scope.kind) {
    case "me":
      return STRINGS.dashboard.funnelBasisMe;
    case "all":
      return STRINGS.dashboard.funnelBasisAll;
    case "user":
      return STRINGS.dashboard.funnelBasisUser;
    case "team":
      return STRINGS.dashboard.funnelBasisTeam;
  }
}

export function FunnelWidget({
  data,
  ownerScope,
}: {
  data: StageConversionRow[];
  ownerScope: OwnerScope;
}) {
  return (
    <Panel
      title={STRINGS.dashboard.widgetFunnelConversion}
      isEmpty={data.length === 0}
      emptyText={STRINGS.dashboard.emptyFunnel}
    >
      {data.length > 0 && (
        <p className="mb-2 text-xs text-muted-foreground">{funnelBasis(ownerScope)}</p>
      )}
      <div className="space-y-2">
        {data.map((s) => (
          <div key={s.stageId}>
            <div className="mb-0.5 flex items-center justify-between text-sm">
              <span className="truncate">{s.name}</span>
              <span className="tabular-nums text-muted-foreground">
                {s.reached} · {Math.round(s.conversion * 100)}%
              </span>
            </div>
            <Bar label={s.name} pct={s.conversion * 100} />
            {s.medianDaysInStage !== null && (
              <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                {durationDays(s.medianDaysInStage)}
              </p>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function ActivitiesWidget({ data }: { data: ActivityCounters }) {
  return (
    <Panel title={STRINGS.dashboard.widgetActivities} isEmpty={false} emptyText="">
      <p className="tabular-nums">
        {STRINGS.dashboard.completed} {data.completed} / {STRINGS.dashboard.scheduled}{" "}
        {data.scheduled}
        {data.undated > 0 && (
          <span className="text-muted-foreground">
            {" "}
            ({STRINGS.dashboard.undated} {data.undated})
          </span>
        )}
      </p>
    </Panel>
  );
}

export function StageSumsWidget({ data, currency }: { data: StageSum[]; currency: string }) {
  const max = Math.max(1, ...data.map((s) => Number(s.total)));
  return (
    <Panel
      title={STRINGS.dashboard.widgetStageSums}
      isEmpty={data.length === 0}
      emptyText={STRINGS.dashboard.emptyStageSums}
    >
      <div className="space-y-2">
        {data.map((s) => (
          <div key={s.stageId}>
            <div className="mb-0.5 flex items-center justify-between text-sm">
              <span className="truncate">{s.name}</span>
              <span className="tabular-nums text-muted-foreground">{money(s.total, currency)}</span>
            </div>
            <Bar label={s.name} pct={(Number(s.total) / max) * 100} />
          </div>
        ))}
      </div>
    </Panel>
  );
}
