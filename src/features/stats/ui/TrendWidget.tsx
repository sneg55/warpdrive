"use client";
import type React from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { STRINGS } from "@/constants/strings";
import type { WonTrendPoint } from "@/types/stats";
import { money, monthLabel, Panel } from "./Panel";
import { trendTooltipValue } from "./trendTooltip";

const SERIES = "value";

const CONFIG: ChartConfig = {
  [SERIES]: { label: STRINGS.dashboard.trendValue, color: "hsl(var(--primary))" },
};

const DOTTED_MONTHS = 24;

function compactMonth(month: string): string {
  return monthLabel(month).split(" ")[0] ?? month;
}

export function WonTrendWidget({
  data,
  currency,
}: {
  data: WonTrendPoint[];
  currency: string;
}): React.ReactNode {
  const hasWins = data.some((p) => p.count > 0);
  const points = data.map((p) => ({ month: p.month, count: p.count, [SERIES]: Number(p.value) }));

  return (
    <Panel
      title={STRINGS.dashboard.widgetWonTrend}
      isEmpty={!hasWins}
      emptyText={STRINGS.dashboard.emptyWonTrend}
    >
      {hasWins && (
        <>
          <ChartContainer config={CONFIG} aria-hidden="true" className="h-48">
            <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickFormatter={compactMonth}
                tickLine={false}
                axisLine={false}
                minTickGap={16}
              />
              <YAxis
                width={64}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => money(String(v), currency)}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(label) => monthLabel(String(label))}
                    formatValue={(value, _key, datum) => trendTooltipValue(value, datum, currency)}
                  />
                }
              />
              <Line
                type="linear"
                dataKey={SERIES}
                stroke={`var(--color-${SERIES})`}
                strokeWidth={2}
                dot={points.length <= DOTTED_MONTHS && { r: 2.5 }}
              />
            </LineChart>
          </ChartContainer>
          <table className="sr-only">
            <caption>{STRINGS.dashboard.trendTableCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{STRINGS.dashboard.trendMonth}</th>
                <th scope="col">{STRINGS.dashboard.trendCount}</th>
                <th scope="col">{STRINGS.dashboard.trendValue}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.month}>
                  <th scope="row">{monthLabel(p.month)}</th>
                  <td>{p.count}</td>
                  <td>{money(p.value, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Panel>
  );
}
