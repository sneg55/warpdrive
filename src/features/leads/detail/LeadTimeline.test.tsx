// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
const { togglePinAction } = vi.hoisted(() => ({
  togglePinAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "n1" } })),
}));
vi.mock("@/features/collaboration/actions", () => ({
  togglePinAction,
  updateNoteAction: vi.fn(),
  deleteNoteAction: vi.fn(),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

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

  it("Focus view shows only the open activity and hides the type-filter row", async () => {
    render(<LeadTimeline items={makeItems(makeActivity({ done: false }))} emails={emails} />);
    await userEvent.click(screen.getByRole("tab", { name: "Focus" }));

    expect(screen.getByText("Follow-up call")).toBeInTheDocument();
    expect(screen.queryByText("Called them")).not.toBeInTheDocument();
    expect(screen.queryByText("Labels: (none) → Hot")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Notes" })).not.toBeInTheDocument();
  });

  it("Focus view shows the empty label when there are no open activities", async () => {
    render(<LeadTimeline items={makeItems(makeActivity({ done: true }))} emails={emails} />);
    await userEvent.click(screen.getByRole("tab", { name: "Focus" }));
    expect(screen.getByText("Nothing needs your attention")).toBeInTheDocument();
  });

  it("History still includes a completed activity, the note, and the label change event", () => {
    render(<LeadTimeline items={makeItems(makeActivity({ done: true }))} emails={emails} />);
    expect(screen.getByText("Follow-up call")).toBeInTheDocument();
    expect(screen.getByText("Called them")).toBeInTheDocument();
    expect(screen.getByText("Labels: (none) → Hot")).toBeInTheDocument();
  });

  it("returning to History restores the type-filter tabs and the full log", async () => {
    render(<LeadTimeline items={makeItems(makeActivity({ done: true }))} emails={emails} />);
    await userEvent.click(screen.getByRole("tab", { name: "Focus" }));
    await userEvent.click(screen.getByRole("tab", { name: "History" }));

    expect(screen.getByRole("tab", { name: "Notes" })).toBeInTheDocument();
    expect(screen.getByText("Called them")).toBeInTheDocument();
  });

  it("floats pinned notes above the Focus/History timeline and removes them from History", () => {
    const items = makeItems(makeActivity({ done: true }));
    items.push({
      kind: "note",
      id: "n2",
      at: new Date("2026-07-02T00:00:00Z"),
      body: "Keep this visible",
      pinned: true,
      actorName: "Nick",
    });
    render(<LeadTimeline items={items} emails={emails} />);

    const pinned = within(screen.getByRole("region", { name: "pinned" }));
    expect(pinned.getByText("Keep this visible")).toBeInTheDocument();
    expect(screen.getAllByText("Keep this visible")).toHaveLength(1);
    expect(screen.getByText("Called them")).toBeInTheDocument();
  });

  it("requests a lead timeline refresh after pinning a note", async () => {
    const onNoteChanged = vi.fn();
    render(
      <LeadTimeline
        items={makeItems(makeActivity({ done: true }))}
        emails={emails}
        onNoteChanged={onNoteChanged}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Pin note" }));
    await waitFor(() => expect(onNoteChanged).toHaveBeenCalledTimes(1));
  });
});
