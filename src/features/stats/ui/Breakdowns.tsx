import { STRINGS } from "@/constants/strings";
import type { ActivityTypeCount, LostReasonCount } from "@/types/stats";
import { Bar, money, Panel } from "./Panel";

export function ActivityTypesWidget({ data }: { data: ActivityTypeCount[] }) {
  const max = Math.max(1, ...data.map((t) => t.completed));
  return (
    <Panel
      title={STRINGS.dashboard.widgetActivityTypes}
      isEmpty={data.length === 0}
      emptyText={STRINGS.dashboard.emptyActivityTypes}
    >
      <div className="space-y-2">
        {data.map((t) => (
          <div key={t.typeId}>
            <div className="mb-0.5 flex items-center justify-between text-sm">
              <span className="truncate">{t.name}</span>
              <span className="tabular-nums text-muted-foreground">{t.completed}</span>
            </div>
            <Bar label={t.name} pct={(t.completed / max) * 100} />
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function LostReasonsWidget({
  data,
  currency,
}: {
  data: LostReasonCount[];
  currency: string;
}) {
  // Scaled by money lost, not by deal count: one deal lost for $91,500 and one for $31,000 are
  // the same count and very different news. The count stays beside the label.
  const max = Math.max(1, ...data.map((r) => Number(r.value)));
  return (
    <Panel
      title={STRINGS.dashboard.widgetLostReasons}
      isEmpty={data.length === 0}
      emptyText={STRINGS.dashboard.emptyLostReasons}
    >
      <div className="space-y-2">
        {data.map((r) => {
          // A null name means the deal was closed lost with nothing recorded, which is worth
          // seeing as its own row rather than hiding.
          const label = r.name ?? STRINGS.dashboard.lostReasonUnspecified;
          return (
            <div key={r.reasonId ?? `text:${r.name ?? "unspecified"}`}>
              <div className="mb-0.5 flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate">{label}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    ({r.count})
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {money(r.value, currency)}
                </span>
              </div>
              <Bar label={label} pct={(Number(r.value) / max) * 100} />
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
