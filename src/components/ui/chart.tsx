"use client";
import type * as React from "react";
import { createContext, useContext, useId } from "react";
import { ResponsiveContainer, Tooltip } from "recharts";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { cn } from "@/lib/utils";

// SANCTIONED recharts wrapper (shadcn `chart`). Feature code composes recharts marks inside
// ChartContainer and never imports ResponsiveContainer or Tooltip directly.
// Series colours are declared in the config as CSS custom properties and published as
// `--color-<key>` on the container, so every mark follows the Day/Night tokens.

export interface ChartSeries {
  label: React.ReactNode;
  // Any CSS colour. Use a token, e.g. `hsl(var(--primary))`, never a literal hex.
  color?: string;
}

export type ChartConfig = Record<string, ChartSeries>;

const ChartContext = createContext<ChartConfig | null>(null);

function useChartConfig(): ChartConfig {
  const config = useContext(ChartContext);
  if (config === null) {
    throw new AppError(
      ERROR_IDS.UI_CHART_CONTEXT_MISSING,
      "chart part rendered outside a ChartContainer",
    );
  }
  return config;
}

function seriesVars(config: ChartConfig): React.CSSProperties {
  const entries = Object.entries(config).flatMap(([key, series]) =>
    series.color === undefined ? [] : [[`--color-${key}`, series.color] as const],
  );
  return Object.fromEntries(entries);
}

export function ChartContainer({
  config,
  className,
  children,
  ...rest
}: {
  config: ChartConfig;
  className?: string;
  children: React.ComponentProps<typeof ResponsiveContainer>["children"];
} & Omit<React.ComponentProps<"div">, "children">): React.ReactNode {
  const id = useId();
  return (
    <ChartContext.Provider value={config}>
      <div
        data-slot="chart"
        data-chart={id}
        style={seriesVars(config)}
        className={cn(
          "w-full text-xs",
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground",
          "[&_.recharts-cartesian-grid_line]:stroke-border",
          "[&_.recharts-cartesian-axis-line]:stroke-border",
          "[&_.recharts-cartesian-axis-tick-line]:stroke-border",
          className,
        )}
        {...rest}
      >
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

export const ChartTooltip = Tooltip;

interface TooltipItem {
  dataKey?: string | number;
  value?: string | number;
  color?: string;
  // The whole row the mark was drawn from. A mark carries one number; the row usually carries the
  // context that makes it readable, e.g. the count behind a sum.
  payload?: unknown;
}

export interface ChartTooltipContentProps {
  active?: boolean;
  payload?: TooltipItem[];
  label?: string | number;
  // Renders one series' number. Money and counts format differently, so the caller owns it; the
  // third argument is the row the mark came from, for context the mark itself does not carry.
  formatValue?: (
    value: string | number | undefined,
    key: string,
    datum: unknown,
  ) => React.ReactNode;
  labelFormatter?: (label: string | number | undefined) => React.ReactNode;
}

export function ChartTooltipContent({
  active,
  payload,
  label,
  formatValue,
  labelFormatter,
}: ChartTooltipContentProps): React.ReactNode {
  const config = useChartConfig();
  if (active !== true || payload === undefined || payload.length === 0) return null;
  return (
    <div className="rounded-md border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{labelFormatter?.(label) ?? label}</p>
      {payload.map((item) => {
        const key = String(item.dataKey ?? "");
        const series = config[key];
        return (
          <p key={key} className="flex items-center gap-1.5 tabular-nums">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-sm"
              style={{ backgroundColor: series?.color ?? item.color }}
            />
            <span className="text-muted-foreground">{series?.label ?? key}</span>
            <span className="ml-auto font-medium">
              {formatValue?.(item.value, key, item.payload) ?? item.value}
            </span>
          </p>
        );
      })}
    </div>
  );
}
