// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContactActivityStats } from "@/features/contacts/activityStats";

afterEach(cleanup);

let stats: ContactActivityStats = {
  total: 0,
  done: 0,
  open: 0,
  byType: {},
  mostActiveUsers: [],
  lastActivityAt: null,
  inactiveDays: null,
};

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    contacts: { activityStats: { useQuery: () => ({ data: stats }) } },
  },
}));

import { ContactOverviewSection } from "./ContactOverviewSection";

describe("ContactOverviewSection", () => {
  it("renders per-type counts, total, last activity and inactive days", () => {
    stats = {
      total: 3,
      done: 2,
      open: 1,
      byType: { call: 2, meeting: 1 },
      mostActiveUsers: [
        { name: "Ann", count: 2 },
        { name: "Bob", count: 1 },
      ],
      lastActivityAt: new Date("2026-07-02T10:00:00Z"),
      inactiveDays: 5,
    };
    render(<ContactOverviewSection entityType="person" entityId="pe1" />);
    const section = within(screen.getByRole("region", { name: "Overview" }));
    expect(section.getByText("Total activities")).toBeInTheDocument();
    expect(section.getByText("3")).toBeInTheDocument();
    // Per-type breakdown (key capitalized).
    expect(section.getByText("Call")).toBeInTheDocument();
    expect(section.getByText("Meeting")).toBeInTheDocument();
    // Most active users (spec B2).
    expect(section.getByText("Most active users")).toBeInTheDocument();
    expect(section.getByText("Ann (2), Bob (1)")).toBeInTheDocument();
    // Inactive days.
    expect(section.getByText("Inactive")).toBeInTheDocument();
    expect(section.getByText(/5/)).toBeInTheDocument();
  });

  it("shows an empty last-activity when nothing is logged", () => {
    stats = {
      total: 0,
      done: 0,
      open: 0,
      byType: {},
      mostActiveUsers: [],
      lastActivityAt: null,
      inactiveDays: null,
    };
    render(<ContactOverviewSection entityType="person" entityId="pe1" />);
    const section = within(screen.getByRole("region", { name: "Overview" }));
    expect(section.getByText("Last activity")).toBeInTheDocument();
    // Never-active contact: a dash placeholder, not a date.
    expect(section.getAllByText("-").length).toBeGreaterThan(0);
  });
});
