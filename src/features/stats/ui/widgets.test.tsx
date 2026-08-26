// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

import { STRINGS } from "@/constants/strings";
import { ActivityTypesWidget, LostReasonsWidget } from "./Breakdowns";
import { Scoreboard } from "./Scoreboard";
import { ActivitiesWidget, DealPerformanceWidget, FunnelWidget, StageSumsWidget } from "./widgets";

describe("stats widgets", () => {
  it("renders won/lost/open counts and values", () => {
    render(
      <DealPerformanceWidget
        currency="USD"
        data={{
          added: { count: 20, value: "500000.00" },
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
    render(<ActivitiesWidget data={{ completed: 88, added: 120, scheduled: 102, undated: 0 }} />);
    // Both counts must appear (they may be part of a larger string)
    expect(screen.getByText(/88/)).toBeInTheDocument();
    expect(screen.getByText(/102/)).toBeInTheDocument();
  });

  it("surfaces open activities that have no due date, which no date window can contain", () => {
    render(<ActivitiesWidget data={{ completed: 3, added: 9, scheduled: 4, undated: 7 }} />);
    expect(screen.getByText(new RegExp(`${STRINGS.dashboard.undated} 7`))).toBeInTheDocument();
  });

  it("draws a funnel bar per stage with conversion as the progress value", () => {
    render(
      <FunnelWidget
        ownerScope="all"
        data={[
          {
            stageId: "s1",
            name: "Lead",
            order: 0,
            reached: 10,
            conversion: 1,
            medianDaysInStage: null,
          },
          {
            stageId: "s2",
            name: "Won",
            order: 1,
            reached: 5,
            conversion: 0.5,
            medianDaysInStage: null,
          },
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
          { stageId: "s1", name: "Lead", order: 0, dealCount: 3, total: "100000.00" },
          { stageId: "s2", name: "Won", order: 1, dealCount: 1, total: "50000.00" },
        ]}
      />,
    );
    expect(screen.getAllByRole("progressbar")).toHaveLength(2);
    // F5-4: renders the stage NAME carried on the row, never a raw stage id.
    expect(screen.getByText("Lead")).toBeInTheDocument();
    expect(screen.getByText("Won")).toBeInTheDocument();
  });

  // A heading over dead space reads as a broken page. Every panel that can be empty says why.
  it("explains an empty funnel instead of rendering a bare heading", () => {
    render(<FunnelWidget data={[]} ownerScope="me" />);
    expect(screen.getByText(STRINGS.dashboard.emptyFunnel)).toBeInTheDocument();
  });

  it("explains empty stage sums", () => {
    render(<StageSumsWidget data={[]} currency="USD" />);
    expect(screen.getByText(STRINGS.dashboard.emptyStageSums)).toBeInTheDocument();
  });

  it("explains an empty lost-reason breakdown", () => {
    render(<LostReasonsWidget data={[]} currency="USD" />);
    expect(screen.getByText(STRINGS.dashboard.emptyLostReasons)).toBeInTheDocument();
  });

  // Free-text reasons all carry a null id, so keying on the id alone collided and React
  // reconciled the wrong row when counts reordered.
  it("renders several free-text lost reasons as distinct rows", () => {
    render(
      <LostReasonsWidget
        currency="USD"
        data={[
          { reasonId: null, name: "Went quiet", count: 3, value: "10.00" },
          { reasonId: null, name: "Chose a rival", count: 1, value: "20.00" },
        ]}
      />,
    );
    expect(screen.getByText("Went quiet")).toBeInTheDocument();
    expect(screen.getByText("Chose a rival")).toBeInTheDocument();
  });

  it("labels a lost deal with no recorded reason rather than dropping the row", () => {
    render(
      <LostReasonsWidget
        currency="USD"
        data={[{ reasonId: null, name: null, count: 2, value: "100.00" }]}
      />,
    );
    expect(screen.getByText(STRINGS.dashboard.lostReasonUnspecified)).toBeInTheDocument();
  });

  // The bar is the only thing a reader compares across rows, so it must encode the money, not
  // the count. Three reasons that each cost one deal drew three identical full-width bars.
  it("scales lost-reason bars by value, not by deal count", () => {
    render(
      <LostReasonsWidget
        currency="USD"
        data={[
          { reasonId: "r1", name: "Bad timing", count: 1, value: "43000.00" },
          { reasonId: "r2", name: "Went with competitor", count: 1, value: "91500.00" },
        ]}
      />,
    );
    expect(screen.getByRole("progressbar", { name: "Went with competitor" })).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
    expect(screen.getByRole("progressbar", { name: "Bad timing" })).toHaveAttribute(
      "aria-valuenow",
      "47",
    );
  });

  it("keeps the deal count beside the reason name once the bar encodes value", () => {
    render(
      <LostReasonsWidget
        currency="USD"
        data={[{ reasonId: "r1", name: "Bad timing", count: 4, value: "43000.00" }]}
      />,
    );
    expect(screen.getByText("Bad timing")).toBeInTheDocument();
    expect(screen.getByText("(4)")).toBeInTheDocument();
    expect(screen.getByText("$43,000")).toBeInTheDocument();
  });

  // Count and money sat in one justify-between row, so four rows put their counts at four
  // different x positions and the money read as the lesser number.
  it("right-aligns both numeric columns of deal performance and keeps the money at full weight", () => {
    render(
      <DealPerformanceWidget
        currency="USD"
        data={{
          added: { count: 10, value: "418500.00" },
          won: { count: 3, value: "58500.00" },
          lost: { count: 3, value: "165500.00" },
          open: { count: 4, value: "194500.00" },
        }}
      />,
    );
    const count = screen.getByText("10");
    expect(count.className).toContain("text-right");
    expect(count.className).toContain("tabular-nums");
    const value = screen.getByText("$418,500");
    expect(value.className).toContain("text-right");
    expect(value.className).toContain("tabular-nums");
    expect(value.className).not.toContain("text-muted-foreground");
  });

  // Seeded and same-day deals sit under half a day, and Math.round turned that into "0 days",
  // which reads as an instant sale rather than "too short to measure".
  it("does not report a sub-day stage dwell time as zero days", () => {
    render(
      <FunnelWidget
        ownerScope="me"
        data={[
          {
            stageId: "s1",
            name: "Lead",
            order: 0,
            reached: 10,
            conversion: 1,
            medianDaysInStage: 0.02,
          },
        ]}
      />,
    );
    expect(screen.getByText(STRINGS.dashboard.underADay)).toBeInTheDocument();
    expect(screen.queryByText(`0 ${STRINGS.dashboard.days}`)).toBeNull();
  });

  it("shows an activity type nobody used, so a gap is visible", () => {
    render(
      <ActivityTypesWidget data={[{ typeId: "t1", key: "call", name: "Call", completed: 0 }]} />,
    );
    expect(screen.getByText("Call")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});

describe("Scoreboard", () => {
  const deals = {
    added: { count: 5, value: "0.00" },
    won: { count: 3, value: "0.00" },
    lost: { count: 1, value: "0.00" },
    open: { count: 9, value: "0.00" },
  };
  const activities = { completed: 12, added: 20, scheduled: 4, undated: 0 };

  it("shows the headline numbers a manager reads first", () => {
    render(
      <Scoreboard
        deals={deals}
        won={{
          avgValue: "1000.00",
          medianValue: "900.00",
          avgCycleDays: 12.4,
          medianCycleDays: 11.6,
        }}
        activities={activities}
        winRate={0.75}
        currency="USD"
      />,
    );
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText(`12 ${STRINGS.dashboard.days}`)).toBeInTheDocument();
  });

  // A rate of zero and a period where nothing closed are different facts, so they must not
  // render the same.
  it("renders a dash, not a zero, when a metric has no data", () => {
    render(
      <Scoreboard
        deals={deals}
        won={{ avgValue: null, medianValue: null, avgCycleDays: null, medianCycleDays: null }}
        activities={activities}
        winRate={null}
        currency="USD"
      />,
    );
    expect(screen.getAllByText(STRINGS.dashboard.noValue).length).toBeGreaterThanOrEqual(3);
  });

  // "0 days" claims deals close the instant they are created. The measurable fact is that the
  // cycle is shorter than the unit this tile reports in.
  it("does not report a sub-day median sales cycle as zero days", () => {
    render(
      <Scoreboard
        deals={deals}
        won={{
          avgValue: "1000.00",
          medianValue: "900.00",
          avgCycleDays: 0.0004,
          medianCycleDays: 0.0004,
        }}
        activities={activities}
        winRate={0.5}
        currency="USD"
      />,
    );
    expect(screen.getByText(STRINGS.dashboard.underADay)).toBeInTheDocument();
    expect(screen.queryByText(`0 ${STRINGS.dashboard.days}`)).toBeNull();
  });
});
