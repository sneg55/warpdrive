// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

import { STRINGS } from "@/constants/strings";
import { ActivitiesWidget, DealPerformanceWidget, FunnelWidget, StageSumsWidget } from "./widgets";

describe("stats widgets", () => {
  it("renders won/lost/open counts and values", () => {
    render(
      <DealPerformanceWidget
        currency="USD"
        data={{
          won: { count: 12, value: "300000.00" },
          lost: { count: 5, value: "80000.00" },
          open: { count: 40, value: "1200000.00" },
        }}
      />,
    );
    // The Won label comes from STRINGS.dashboard.won
    expect(screen.getByText(STRINGS.dashboard.won)).toBeInTheDocument();
    // The count 12 must appear
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("renders activities completed vs scheduled", () => {
    render(<ActivitiesWidget data={{ completed: 88, scheduled: 102 }} />);
    // Both counts must appear (they may be part of a larger string)
    expect(screen.getByText(/88/)).toBeInTheDocument();
    expect(screen.getByText(/102/)).toBeInTheDocument();
  });

  it("draws a funnel bar per stage with conversion as the progress value", () => {
    render(
      <FunnelWidget
        data={[
          { stageId: "s1", name: "Lead", order: 0, reached: 10, conversion: 1 },
          { stageId: "s2", name: "Won", order: 1, reached: 5, conversion: 0.5 },
        ]}
      />,
    );
    expect(screen.getByRole("progressbar", { name: "Lead" })).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
    expect(screen.getByRole("progressbar", { name: "Won" })).toHaveAttribute("aria-valuenow", "50");
  });

  it("draws a bar per stage in stage sums", () => {
    render(
      <StageSumsWidget
        currency="USD"
        data={[
          { stageId: "s1", name: "Lead", dealCount: 3, total: "100000.00" },
          { stageId: "s2", name: "Won", dealCount: 1, total: "50000.00" },
        ]}
      />,
    );
    expect(screen.getAllByRole("progressbar")).toHaveLength(2);
    // F5-4: renders the stage NAME carried on the row, never a raw stage id.
    expect(screen.getByText("Lead")).toBeInTheDocument();
    expect(screen.getByText("Won")).toBeInTheDocument();
  });
});
