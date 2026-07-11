// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarActivity } from "@/features/activities/calendar";
import type { HistoryItem } from "@/features/deal-workspace/historyTimeline";

afterEach(cleanup);

vi.mock("@/features/activities/actions", () => ({
  completeActivityAction: () => Promise.resolve({ ok: true as const, value: { id: "a1" } }),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

function activity(overrides: Partial<CalendarActivity> = {}): CalendarActivity {
  return {
    id: "a1",
    subject: "Open follow-up",
    dueAt: new Date("2026-07-02T10:00:00Z"),
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

// Mutable per-test fixture so each test can shape what the mocked query returns without
// redefining the whole vi.mock factory.
let queryItems: HistoryItem[] = mixedItems;
const invalidate = vi.fn();
const invalidateActivityStats = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    contacts: {
      contactTimeline: { useQuery: () => ({ data: { items: queryItems } }) },
    },
    useUtils: () => ({
      contacts: {
        contactTimeline: { invalidate },
        activityStats: { invalidate: invalidateActivityStats },
      },
    }),
  },
}));

import { ContactTimelinePanel, CustomFieldsPanel } from "./contactDetail.shared";

describe("ContactTimelinePanel", () => {
  afterEach(() => {
    queryItems = mixedItems;
  });

  it("stacks Focus and History as always-visible sections (no toggle)", () => {
    // S1: Focus and History are stacked sections, not a mutually-exclusive toggle, matching
    // the deal page. The open activity sits under Focus; the done activity and note under
    // History, all visible at once.
    render(<ContactTimelinePanel entityType="person" entityId="pe1" />);

    expect(screen.getByRole("heading", { name: "Focus" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "History" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Focus" })).not.toBeInTheDocument();

    // Every item is visible simultaneously (no clicking).
    expect(screen.getByText("Open follow-up")).toBeInTheDocument();
    expect(screen.getByText("Done call")).toBeInTheDocument();
    expect(screen.getByText("Called Jane")).toBeInTheDocument();
  });

  it("renders the deal-page history filter row and filters the History bucket by type", () => {
    // CO-1: the contact Activity feed gets the same per-type filter row the deal page has
    // (All/Activities/Notes/Email/Files/Changelog). The filter buckets the History side only;
    // Focus (open activities) is unaffected.
    render(<ContactTimelinePanel entityType="person" entityId="pe1" />);

    expect(screen.getByRole("tab", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Activities/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Notes/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Email" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Files" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Changelog" })).toBeInTheDocument();

    // Default "All": the done activity and the note both show under History.
    expect(screen.getByText("Done call")).toBeInTheDocument();
    expect(screen.getByText("Called Jane")).toBeInTheDocument();

    // Click "Notes": only the note remains in History; the done activity is filtered out.
    fireEvent.click(screen.getByRole("tab", { name: /Notes/ }));
    expect(screen.getByText("Called Jane")).toBeInTheDocument();
    expect(screen.queryByText("Done call")).not.toBeInTheDocument();
    // Focus is above the filter row and unaffected by it.
    expect(screen.getByText("Open follow-up")).toBeInTheDocument();
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
    // Both sections render at once: History shows the note, Focus shows its empty label.
    expect(screen.getByText("Called Jane")).toBeInTheDocument();
    expect(screen.getByText("Nothing needs your attention")).toBeInTheDocument();
  });
});

// Wave 4, Task 5: the person/org detail header shows who owns the record via the shared
// OwnerBadge (avatar + name), sourced from the joined ownerName the repos now return.

// CO-2: the Custom fields block must be a CollapsibleSection like the other sidebar sections
// (collapse toggle + consistent heading), not a bespoke bordered <section> with a bare <h2>.
describe("CustomFieldsPanel", () => {
  const defs = [{ id: "cf1", key: "vip", name: "VIP tier" }];

  it("renders inside a collapsible section matching the other sidebar sections", () => {
    render(
      <CustomFieldsPanel
        defs={defs}
        values={{ vip: "Gold" }}
        renderValue={(_def, value) => String(value)}
      />,
    );
    const toggle = screen.getByRole("button", { name: /custom fields/i });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("VIP tier")).toBeInTheDocument();
    expect(screen.getByText("Gold")).toBeInTheDocument();
  });

  it("renders nothing when there are no custom-field defs", () => {
    const { container } = render(
      <CustomFieldsPanel defs={[]} values={{}} renderValue={() => null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
