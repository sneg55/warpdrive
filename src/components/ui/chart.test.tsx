// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  render(<ChartContainer config={CONFIG}>{node as never}</ChartContainer>);
}

describe("ChartTooltipContent", () => {
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
