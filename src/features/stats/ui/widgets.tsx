import { STRINGS } from "@/constants/strings";
import type { ActivityPerformance, DealPerformance, FunnelStage, StageSum } from "@/types/stats";

function money(v: string, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(v));
}

// Accessible horizontal bar (Pipedrive visualizes these stats as bars/funnels).
// pct is 0..100; label names the measure for screen readers.
function Bar({ label, pct }: { label: string; pct: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2 w-full overflow-hidden rounded bg-muted"
    >
      <div className="h-full rounded bg-primary" style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function DealPerformanceWidget({
  data,
  currency,
}: {
  data: DealPerformance;
  currency: string;
}) {
  const rows: [string, { count: number; value: string }][] = [
    [STRINGS.dashboard.won, data.won],
    [STRINGS.dashboard.lost, data.lost],
    [STRINGS.dashboard.open, data.open],
  ];
  return (
    <section className="rounded-lg border p-4">
      <h2 className="mb-2 text-balance text-sm font-medium text-muted-foreground">
        {STRINGS.dashboard.widgetDealPerformance}
      </h2>
      {rows.map(([label, b]) => (
        <div key={label} className="flex items-center justify-between py-1">
          <span>{label}</span>
          <span className="tabular-nums">{b.count}</span>
          <span className="tabular-nums text-muted-foreground">{money(b.value, currency)}</span>
        </div>
      ))}
    </section>
  );
}

export function FunnelWidget({ data }: { data: FunnelStage[] }) {
  return (
    <section className="rounded-lg border p-4">
      <h2 className="mb-2 text-balance text-sm font-medium text-muted-foreground">
        {STRINGS.dashboard.widgetFunnelConversion}
      </h2>
      <div className="space-y-2">
        {data.map((s) => (
          <div key={s.stageId}>
            <div className="mb-0.5 flex items-center justify-between text-sm">
              <span className="truncate">{s.name}</span>
              <span className="tabular-nums text-muted-foreground">
                {Math.round(s.conversion * 100)}%
              </span>
            </div>
            <Bar label={s.name} pct={s.conversion * 100} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function ActivitiesWidget({ data }: { data: ActivityPerformance }) {
  return (
    <section className="rounded-lg border p-4">
      <h2 className="mb-2 text-balance text-sm font-medium text-muted-foreground">
        {STRINGS.dashboard.widgetActivities}
      </h2>
      <p className="tabular-nums">
        {STRINGS.dashboard.completed} {data.completed} / {STRINGS.dashboard.scheduled}{" "}
        {data.scheduled}
      </p>
    </section>
  );
}

export function StageSumsWidget({ data, currency }: { data: StageSum[]; currency: string }) {
  return (
    <section className="rounded-lg border p-4">
      <h2 className="mb-2 text-balance text-sm font-medium text-muted-foreground">
        {STRINGS.dashboard.widgetStageSums}
      </h2>
      <div className="space-y-2">
        {(() => {
          const max = Math.max(1, ...data.map((s) => Number(s.total)));
          return data.map((s) => {
            const name = s.name;
            return (
              <div key={s.stageId}>
                <div className="mb-0.5 flex items-center justify-between text-sm">
                  <span className="truncate">{name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {money(s.total, currency)}
                  </span>
                </div>
                <Bar label={name} pct={(Number(s.total) / max) * 100} />
              </div>
            );
          });
        })()}
      </div>
    </section>
  );
}
