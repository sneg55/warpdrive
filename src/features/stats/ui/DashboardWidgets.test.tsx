// @vitest-environment jsdom
// Wiring test: a widget that no page renders is not shipped. This mounts the Performance page
// with a full payload and asserts the trend and the funnel's basis actually reach the screen.
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

const dashboardData = {
  dealPerformance: {
    added: { count: 4, value: "100.00" },
    won: { count: 2, value: "80.00" },
    lost: { count: 1, value: "20.00" },
    open: { count: 1, value: "0.00" },
  },
  winRate: 0.5,
  wonDealStats: {
    avgValue: "40.00",
    medianValue: "40.00",
    avgCycleDays: 3,
    medianCycleDays: 3,
  },
  wonTrend: [
    { month: "2026-01", count: 2, value: "80.00" },
    { month: "2026-02", count: 0, value: "0.00" },
  ],
  funnel: [
    {
      stageId: "s1",
      name: "Qualified",
      order: 0,
      reached: 10,
      conversion: 1,
      medianDaysInStage: null,
    },
  ],
  activities: { completed: 1, added: 1, scheduled: 0, undated: 0 },
  activitiesByType: [],
  lostReasons: [],
  stageSums: [],
  // The server narrows a regular user's "all" request to "me"; the funnel line must follow the
  // resolved value, not the one the client asked for.
  effectiveOwnerScope: "me" as const,
};

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    stats: {
      dashboard: {
        useQuery: () => ({ isLoading: false, isError: false, data: dashboardData }),
      },
    },
    goals: { list: { useQuery: () => ({ data: [] }) } },
    pipeline: { list: { useQuery: () => ({ data: [{ id: "p1", name: "Sales", stages: [] }] }) } },
  },
}));

import { STRINGS } from "@/constants/strings";
import { Dashboard } from "./Dashboard";

describe("Performance page widgets", () => {
  it("renders the won-deal trend with its numbers in an accessible table", () => {
    render(<Dashboard today="2026-03-01" canViewOthers currency="USD" />);
    expect(
      screen.getByRole("table", { name: STRINGS.dashboard.trendTableCaption }),
    ).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Jan 2026/ })).toBeInTheDocument();
  });

  it("states the funnel's basis using the owner scope the server resolved", () => {
    render(<Dashboard today="2026-03-01" canViewOthers currency="USD" />);
    expect(screen.getByText(STRINGS.dashboard.funnelBasisMe)).toBeInTheDocument();
  });
});
