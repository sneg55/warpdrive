// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarActivity } from "@/features/activities/calendar";
import type { HistoryItem } from "@/features/deal-workspace/historyTimeline";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@/features/activities/actions", () => ({
  completeActivityAction: () => Promise.resolve({ ok: true as const, value: { id: "a1" } }),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("@/features/collaboration/actions", () => ({
  togglePinAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "n1" } })),
  updateNoteAction: vi.fn(),
  deleteNoteAction: vi.fn(),
}));

function activity(overrides: Partial<CalendarActivity> = {}): CalendarActivity {
  return {
    id: "a1",
    subject: "Open follow-up",
    dueAt: new Date("2026-07-02T10:00:00Z"),
    allDay: false,
    durationMinutes: null,
    typeKey: "call",
    done: false,
    dealId: null,
    personId: "pe1",
    orgId: null,
    overdue: false,
    ownerName: "Nick",
    note: null,
    location: null,
    ...overrides,
  };
}

const mixedItems: HistoryItem[] = [
  { kind: "activity", id: "a1", at: new Date("2026-07-02T10:00:00Z"), activity: activity() },
  {
    kind: "activity",
    id: "a2",
    at: new Date("2026-07-01T10:00:00Z"),
    activity: activity({ id: "a2", subject: "Done call", done: true }),
  },
  {
    kind: "note",
    id: "n1",
    at: new Date("2026-06-30T10:00:00Z"),
    body: "Called Jane",
    pinned: false,
    actorName: "Nick",
  },
];

let queryItems: HistoryItem[] = mixedItems;
const invalidate = vi.fn();
const invalidateActivityStats = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    intercom: { list: { useQuery: () => ({ data: undefined }) } },
    brevo: { list: { useQuery: () => ({ data: undefined }) } },
    contacts: {
      contactTimeline: { useQuery: () => ({ data: { items: queryItems } }) },
    },
    email: { listMessagesForContact: { useQuery: () => ({ data: [], isError: false }) } },
    files: { listForEntity: { useQuery: () => ({ data: [{ id: "f1" }, { id: "f2" }] }) } },
    useUtils: () => ({
      contacts: {
        contactTimeline: { invalidate },
        activityStats: { invalidate: invalidateActivityStats },
      },
      email: { listMessagesForContact: { invalidate: vi.fn() } },
    }),
  },
}));

import { ContactTimelinePanel, ListPanel, TabStrip } from "./contactDetail.shared";

describe("ContactTimelinePanel", () => {
  afterEach(() => {
    queryItems = mixedItems;
  });

  it("stacks Focus and History as always-visible sections (no toggle)", () => {
    render(<ContactTimelinePanel entityType="person" entityId="pe1" />);

    expect(screen.getByRole("heading", { name: "Focus" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "History" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Focus" })).not.toBeInTheDocument();

    expect(screen.getByText("Open follow-up")).toBeInTheDocument();
    expect(screen.getByText("Done call")).toBeInTheDocument();
    expect(screen.getByText("Called Jane")).toBeInTheDocument();
  });

  it("renders the deal-page history filter row and filters the History bucket by type", async () => {
    render(<ContactTimelinePanel entityType="person" entityId="pe1" />);

    expect(screen.getByRole("tab", { name: /^All/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Activities/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Notes/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Email/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Files/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Changelog/ })).toBeInTheDocument();

    expect(screen.getByText("Done call")).toBeInTheDocument();
    expect(screen.getByText("Called Jane")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /Notes/ }));
    expect(screen.getByText("Called Jane")).toBeInTheDocument();
    expect(screen.queryByText("Done call")).not.toBeInTheDocument();
    expect(screen.getByText("Open follow-up")).toBeInTheDocument();
  });

  it("counts every History tab and leaves the empty ones unbadged", () => {
    render(<ContactTimelinePanel entityType="person" entityId="pe1" />);
    expect(screen.getByRole("tab", { name: "All (2)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Activities (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Notes (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Files (2)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Email" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Changelog" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /\(0\)/ })).not.toBeInTheDocument();
  });

  it("shows the Focus empty label when nothing is open, alongside History", () => {
    queryItems = [
      {
        kind: "note",
        id: "n1",
        at: new Date("2026-06-30T10:00:00Z"),
        body: "Called Jane",
        pinned: false,
        actorName: "Nick",
      },
    ];
    render(<ContactTimelinePanel entityType="organization" entityId="o1" />);
    expect(screen.getByText("Called Jane")).toBeInTheDocument();
    expect(screen.getByText("Nothing needs your attention")).toBeInTheDocument();
  });

  it.each([
    ["person" as const, "pe1"],
    ["organization" as const, "o1"],
  ])("floats pinned notes above Focus on the %s timeline", (entityType, entityId) => {
    queryItems = [
      ...mixedItems,
      {
        kind: "note",
        id: "n2",
        at: new Date("2026-07-03T10:00:00Z"),
        body: "Keep this visible",
        pinned: true,
        actorName: "Nick",
      },
    ];
    render(<ContactTimelinePanel entityType={entityType} entityId={entityId} />);

    const pinned = within(screen.getByRole("region", { name: "pinned" }));
    expect(pinned.getByText("Keep this visible")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "history" })).queryByText("Keep this visible"),
    ).not.toBeInTheDocument();
  });

  it("invalidates the contact timeline after pinning a note", async () => {
    render(<ContactTimelinePanel entityType="person" entityId="pe1" />);
    await userEvent.click(screen.getByRole("button", { name: "Pin note" }));

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ entityType: "person", entityId: "pe1" }),
    );
    expect(invalidateActivityStats).not.toHaveBeenCalled();
  });
});

describe("contact detail theme tokens", () => {
  it("colours the tab strip and the empty line from tokens, not a fixed gray", () => {
    render(
      <TabStrip
        tabs={["overview"] as const}
        labels={{ overview: "Overview" }}
        active="overview"
        onSelect={vi.fn()}
      />,
    );
    const tab = screen.getByRole("tab", { name: "Overview" });
    expect(tab).toHaveClass("text-muted-foreground", "hover:text-foreground");
    expect(tab.className).not.toMatch(/-gray-/);

    cleanup();
    render(<ListPanel items={[]} empty="Nothing here" render={() => null} />);
    expect(screen.getByText("Nothing here")).toHaveClass("text-muted-foreground");
  });
});
