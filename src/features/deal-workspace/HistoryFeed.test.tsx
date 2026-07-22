// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarActivity } from "@/features/activities/calendar";

// ActivityCard (rendered inside HistoryFeed) reads trpc.useUtils for its optimistic mark-done.
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      activities: { listForEntity: { setData: () => {}, invalidate: () => {} } },
    }),
  },
}));

import { HistoryFeed } from "./HistoryFeed";
import type { HistoryItem } from "./historyTimeline";

vi.mock("@/features/activities/actions", () => ({
  completeActivityAction: () => Promise.resolve({ ok: true as const, value: { id: "a1" } }),
}));
vi.mock("@/features/collaboration/actions", () => ({
  togglePinAction: () => Promise.resolve({ ok: true as const, value: { id: "n1" } }),
  updateNoteAction: () => Promise.resolve({ ok: true as const, value: { id: "n1" } }),
  deleteNoteAction: () => Promise.resolve({ ok: true as const, value: { id: "n1" } }),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

afterEach(cleanup);

const AT = new Date("2026-07-02T10:00:00Z");

function activity(): CalendarActivity {
  return {
    id: "a1",
    subject: "Discovery call",
    dueAt: AT,
    durationMinutes: null,
    typeKey: "call",
    done: false,
    dealId: "d1",
    personId: null,
    orgId: null,
    overdue: false,
    ownerName: "Nick",
  };
}

describe("HistoryFeed dispatch", () => {
  it("renders created, stage, and activity blocks by kind", () => {
    const items: HistoryItem[] = [
      { kind: "activity", id: "a1", at: AT, activity: activity() },
      { kind: "event", id: "s1", at: AT, label: "Stage: Demo → Proposal", actorName: "Nick" },
      { kind: "created", id: "deal-created", at: AT, actorName: "Nick" },
    ];
    render(<HistoryFeed items={items} emptyLabel="empty" />);
    expect(screen.getByText("Deal created")).toBeInTheDocument();
    // Stage change renders as an inline event row, same shape as a status change.
    expect(screen.getByText("Stage: Demo → Proposal")).toBeInTheDocument();
    expect(screen.getByText("Discovery call")).toBeInTheDocument();
  });

  it("shows the empty label when there are no items", () => {
    render(<HistoryFeed items={[]} emptyLabel="No history yet." />);
    expect(screen.getByText("No history yet.")).toBeInTheDocument();
  });

  it("shows an activity's type icon once (in the card), not duplicated on the timeline rail", () => {
    // A task activity's type glyph is a checkmark; rendering it on the rail AND in the card made the
    // row look like it had a stray checkmark next to the (empty) done toggle. The type icon must
    // appear only once, next to the subject.
    const items: HistoryItem[] = [
      { kind: "activity", id: "a1", at: AT, activity: { ...activity(), typeKey: "task" } },
    ];
    const { container } = render(<HistoryFeed items={items} emptyLabel="empty" />);
    // ActivityTypeIcon renders an <svg class="h-4 w-4 shrink-0">; there must be exactly one.
    expect(container.querySelectorAll("svg.h-4.w-4.shrink-0")).toHaveLength(1);
  });
});
