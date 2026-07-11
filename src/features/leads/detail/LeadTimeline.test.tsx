// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarActivity } from "@/features/activities/calendar";
import type { HistoryItem } from "@/features/deal-workspace/historyTimeline";

// ActivityCard (rendered inside LeadTimeline) reads trpc.useUtils for its optimistic mark-done.
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      activities: { listForEntity: { setData: () => {}, invalidate: () => {} } },
    }),
  },
}));

import type { LeadTimelineEmail } from "../leadTimeline";
import { LeadTimeline } from "./LeadTimeline";

afterEach(cleanup);

function makeActivity(overrides: Partial<CalendarActivity> = {}): CalendarActivity {
  return {
    id: "a1",
    subject: "Follow-up call",
    dueAt: new Date("2026-07-03T00:00:00Z"),
    durationMinutes: null,
    typeKey: "call",
    done: false,
    dealId: null,
    personId: null,
    orgId: null,
    overdue: false,
    ownerName: "Nick",
    ...overrides,
  };
}

function makeItems(activity: CalendarActivity): HistoryItem[] {
  return [
    { kind: "activity", id: activity.id, at: activity.dueAt, activity },
    {
      kind: "note",
      id: "n1",
      at: new Date("2026-07-01T00:00:00Z"),
      body: "Called them",
      pinned: false,
      actorName: "Nick",
    },
    {
      kind: "event",
      id: "e1",
      at: new Date("2026-06-30T00:00:00Z"),
      label: "Labels: (none) → Hot",
      actorName: "Nick",
    },
  ];
}

const emails: LeadTimelineEmail[] = [];

describe("LeadTimeline", () => {
  it("defaults to History with the Focus/History switch and type-filter tabs both visible", () => {
    render(<LeadTimeline items={makeItems(makeActivity())} emails={emails} />);
    expect(screen.getByRole("tab", { name: "Focus" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Activities" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Notes" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Email" })).toBeInTheDocument();
  });

  it("Focus view shows only the open activity and hides the type-filter row", () => {
    render(<LeadTimeline items={makeItems(makeActivity({ done: false }))} emails={emails} />);
    fireEvent.click(screen.getByRole("tab", { name: "Focus" }));

    expect(screen.getByText("Follow-up call")).toBeInTheDocument();
    expect(screen.queryByText("Called them")).not.toBeInTheDocument();
    expect(screen.queryByText("Labels: (none) → Hot")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Notes" })).not.toBeInTheDocument();
  });

  it("Focus view shows the empty label when there are no open activities", () => {
    render(<LeadTimeline items={makeItems(makeActivity({ done: true }))} emails={emails} />);
    fireEvent.click(screen.getByRole("tab", { name: "Focus" }));
    expect(screen.getByText("Nothing needs your attention")).toBeInTheDocument();
  });

  it("History still includes a completed activity, the note, and the label change event", () => {
    render(<LeadTimeline items={makeItems(makeActivity({ done: true }))} emails={emails} />);
    expect(screen.getByText("Follow-up call")).toBeInTheDocument();
    expect(screen.getByText("Called them")).toBeInTheDocument();
    expect(screen.getByText("Labels: (none) → Hot")).toBeInTheDocument();
  });

  it("returning to History restores the type-filter tabs and the full log", () => {
    render(<LeadTimeline items={makeItems(makeActivity({ done: true }))} emails={emails} />);
    fireEvent.click(screen.getByRole("tab", { name: "Focus" }));
    fireEvent.click(screen.getByRole("tab", { name: "History" }));

    expect(screen.getByRole("tab", { name: "Notes" })).toBeInTheDocument();
    expect(screen.getByText("Called them")).toBeInTheDocument();
  });
});
