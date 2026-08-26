// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// ResponsiveContainer measures its parent and renders nothing at jsdom's zero size, which would
// swallow the tooltip under test. Everything else here is the real component.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

import { type ChartConfig, ChartContainer, ChartTooltipContent } from "./chart";

afterEach(cleanup);

const CONFIG: ChartConfig = { value: { label: "Value won", color: "hsl(var(--primary))" } };

function renderTooltip(node: React.ReactNode): void {
  // ChartTooltipContent reads the config off the container's context.
  render(<ChartContainer config={CONFIG}>{node as never}</ChartContainer>);
}

describe("ChartTooltipContent", () => {
  // Recharts keys the payload by the mark's dataKey, so a config keyed differently silently
  // falls through to the raw key and the tooltip labels the series with a variable name.
  it("names the series from the config rather than the raw data key", () => {
    renderTooltip(
      <ChartTooltipContent
        active
        label="2026-08"
        payload={[{ dataKey: "value", value: 58500 }]}
        labelFormatter={(l) => `Month ${String(l)}`}
        formatValue={(v) => `$${String(v)}`}
      />,
    );
    expect(screen.getByText("Value won")).toBeInTheDocument();
    expect(screen.queryByText("value")).toBeNull();
  });

  // The mark carries one number, but the row it came from carries more. Handing the datum to the
  // formatter is what lets a money series also state the count behind it.
  it("hands the whole datum to the formatter", () => {
    renderTooltip(
      <ChartTooltipContent
        active
        label="2026-08"
        payload={[{ dataKey: "value", value: 58500, payload: { count: 3, value: 58500 } }]}
        formatValue={(v, _key, datum) => {
          const count = (datum as { count?: number } | undefined)?.count ?? 0;
          return `$${String(v)} from ${count}`;
        }}
      />,
    );
    expect(screen.getByText("$58500 from 3")).toBeInTheDocument();
  });
});
