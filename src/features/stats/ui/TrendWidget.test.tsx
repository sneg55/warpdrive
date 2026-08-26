// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

import { STRINGS } from "@/constants/strings";
import type { WonTrendPoint } from "@/types/stats";
import { WonTrendWidget } from "./TrendWidget";

const DATA: WonTrendPoint[] = [
  { month: "2026-01", count: 2, value: "1500.00" },
  { month: "2026-02", count: 0, value: "0.00" },
  { month: "2026-03", count: 1, value: "2000.00" },
];

describe("WonTrendWidget", () => {
  // A line of SVG carries no text. The table is the readable copy of the same numbers, and it
  // is what these tests assert on, so nothing depends on recharts internals.
  it("carries every plotted number in an accessible table", () => {
    render(<WonTrendWidget data={DATA} currency="USD" />);
    const table = screen.getByRole("table", { name: STRINGS.dashboard.trendTableCaption });
    expect(within(table).getAllByRole("row")).toHaveLength(DATA.length + 1);
    expect(within(table).getByText("$1,500")).toBeInTheDocument();
    expect(within(table).getByText("$2,000")).toBeInTheDocument();
  });

  it("names each month in words rather than leaving a raw YYYY-MM key", () => {
    render(<WonTrendWidget data={DATA} currency="USD" />);
    expect(screen.getByRole("row", { name: /Jan 2026/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Mar 2026/ })).toBeInTheDocument();
  });

  // A gap in a line reads as missing data; a zero reads as zero. The table has to say the same.
  it("keeps a month with no wins as a zero row instead of dropping it", () => {
    render(<WonTrendWidget data={DATA} currency="USD" />);
    const february = screen.getByRole("row", { name: /Feb 2026/ });
    expect(within(february).getByText("0")).toBeInTheDocument();
  });

  // The SVG restates the table, so exposing both makes a screen reader read every number twice.
  it("hides the drawn chart from assistive tech, leaving the table as the single source", () => {
    const { container } = render(<WonTrendWidget data={DATA} currency="USD" />);
    expect(container.querySelector('[data-slot="chart"]')).toHaveAttribute("aria-hidden", "true");
  });

  // An axis over an empty range implies data that is not there.
  it("explains an empty range instead of drawing an axis with nothing on it", () => {
    render(
      <WonTrendWidget
        data={[
          { month: "2026-01", count: 0, value: "0.00" },
          { month: "2026-02", count: 0, value: "0.00" },
        ]}
        currency="USD"
      />,
    );
    expect(screen.getByText(STRINGS.dashboard.emptyWonTrend)).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("explains a range that produced no months at all", () => {
    render(<WonTrendWidget data={[]} currency="USD" />);
    expect(screen.getByText(STRINGS.dashboard.emptyWonTrend)).toBeInTheDocument();
  });
});
