// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Deal } from "@/db/schema";
import type { CalendarActivity } from "@/features/activities/calendar";
import { WorkspaceTabs } from "./tabs";

// tRPC is a network boundary here; stub the two queries WorkspaceTabs reads. The fixture data
// (one note, one stage-change changelog entry) lets the supplementary tests below exercise
// count badges, stage-name resolution, and the created anchor, none of which the brief's own
// "shows Focus and History at once" assertions depend on. Notes are a mutable holder so a test
// can seed a pinned note without a per-test module mock.
const noteState = vi.hoisted(() => ({
  notes: [{ id: "n1", body: "hi", createdAt: new Date("2026-07-01T00:00:00Z"), pinned: false }],
}));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    // ActivityCard (rendered in the Focus/History feeds) reads useUtils for its optimistic mark-done.
    useUtils: () => ({
      activities: { listForEntity: { setData: () => {}, invalidate: () => {} } },
    }),
    collaboration: {
      listNotes: {
        useQuery: () => ({ data: noteState.notes }),
      },
      listChangeLog: {
        useQuery: () => ({
          data: [
            {
              id: "c1",
              field: "stageId",
              oldValue: "stage-demo",
              newValue: "stage-proposal",
              actorId: null,
              actorName: "Nick",
              createdAt: new Date("2026-07-02T00:00:00Z"),
            },
          ],
        }),
      },
    },
  },
}));
vi.mock("@/features/activities/actions", () => ({
  completeActivityAction: () => Promise.resolve({ ok: true as const, value: { id: "a1" } }),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

afterEach(() => {
  cleanup();
  noteState.notes = [
    { id: "n1", body: "hi", createdAt: new Date("2026-07-01T00:00:00Z"), pinned: false },
  ];
});

function makeActivity(overrides: Partial<CalendarActivity> = {}): CalendarActivity {
  return {
    id: "a1",
    subject: "Call",
    dueAt: new Date("2026-07-03T00:00:00Z"),
    durationMinutes: null,
    typeKey: "call",
    done: false,
    dealId: "d1",
    personId: null,
    orgId: null,
    overdue: false,
    ownerName: "Nick",
    ...overrides,
  };
}

const deal = { id: "d1", createdAt: new Date("2026-06-01T00:00:00Z") } as unknown as Deal;

const stages = [
  { id: "stage-demo", name: "Demo" },
  { id: "stage-proposal", name: "Proposal" },
];

function renderTabs() {
  return render(
    <WorkspaceTabs
      deal={deal}
      tab="all"
      onTab={() => {}}
      activities={[makeActivity()]}
      stages={stages}
      createdActorName="Nick"
    />,
  );
}

it("shows Focus and History at once with no toggle", () => {
  render(
    <WorkspaceTabs
      deal={deal}
      tab="all"
      onTab={() => {}}
      activities={[]}
      stages={[]}
      createdActorName="Nick"
    />,
  );
  // Both section headings render together (stacked, not toggled).
  expect(screen.getByRole("heading", { name: /Focus/ })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /History/ })).toBeInTheDocument();
  // The History Email sub-tab is reachable immediately (no Focus/History toggle to click first).
  expect(screen.getByRole("tab", { name: /Email/ })).toBeInTheDocument();
  // The old Focus/History toggle tablist is gone.
  expect(screen.queryByRole("tablist", { name: /Timeline view/ })).not.toBeInTheDocument();
});

describe("WorkspaceTabs", () => {
  it("keeps Activities and Notes counts but drops the changelog count", () => {
    // A completed activity so it lands in the History bucket the badge counts from.
    render(
      <WorkspaceTabs
        deal={deal}
        tab="all"
        onTab={() => {}}
        activities={[makeActivity({ done: true })]}
        stages={stages}
        createdActorName="Nick"
      />,
    );
    expect(screen.getByRole("tab", { name: "Activities (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Notes (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Changelog" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Changelog \(/ })).not.toBeInTheDocument();
  });

  it("Activities badge counts only the completed activities shown in History, not the unfiltered total", () => {
    // 3 open (Focus-bound) + 1 completed (History-bound): the badge above the
    // single-item History list must read (1), not the raw activities.length of 4.
    render(
      <WorkspaceTabs
        deal={deal}
        tab="all"
        onTab={() => {}}
        activities={[
          makeActivity({ id: "a1", done: false }),
          makeActivity({ id: "a2", done: false }),
          makeActivity({ id: "a3", done: false }),
          makeActivity({ id: "a4", done: true }),
        ]}
        stages={stages}
        createdActorName="Nick"
      />,
    );
    expect(screen.getByRole("tab", { name: "Activities (1)" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Activities (4)" })).not.toBeInTheDocument();
  });

  it("resolves stageId changelog ids to names and synthesizes a Deal created anchor", () => {
    renderTabs();
    // Stage change renders as an inline event row with resolved names, not raw ids.
    expect(screen.getByText("Stage: Demo → Proposal")).toBeInTheDocument();
    expect(screen.queryByText("stage-proposal")).not.toBeInTheDocument();
    // Lazy "Deal created" anchor from deal.createdAt.
    expect(screen.getByText("Deal created")).toBeInTheDocument();
  });

  it("does not show a Deal created anchor under the Changelog tab", () => {
    render(
      <WorkspaceTabs
        deal={deal}
        tab="changelog"
        onTab={() => {}}
        activities={[makeActivity()]}
        stages={stages}
        createdActorName="Nick"
      />,
    );
    expect(screen.queryByText("Deal created")).not.toBeInTheDocument();
    expect(screen.getByText("Stage: Demo → Proposal")).toBeInTheDocument();
  });

  it("switches tabs via the onTab callback", () => {
    const onTab = vi.fn();
    render(
      <WorkspaceTabs
        deal={deal}
        tab="all"
        onTab={onTab}
        activities={[makeActivity()]}
        stages={stages}
        createdActorName="Nick"
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Notes (1)" }));
    expect(onTab).toHaveBeenCalledWith("notes");
  });

  it("Focus and History are both visible: Focus holds only the open activity, History holds the full log", () => {
    renderTabs();
    const focusSection = within(screen.getByRole("region", { name: "focus" }));
    const historySection = within(screen.getByRole("region", { name: "history" }));

    // renderTabs()'s single activity is open (done: false), so it's Focus-bound.
    expect(focusSection.getByText("Call")).toBeInTheDocument();
    expect(focusSection.queryByText("Deal created")).not.toBeInTheDocument();
    expect(focusSection.queryByText("hi")).not.toBeInTheDocument();

    // History (default tab "all") is unaffected by Focus and still shows the rest of the log.
    expect(historySection.getByText("Deal created")).toBeInTheDocument();
    expect(historySection.getByText("hi")).toBeInTheDocument();
    // The open activity lives in Focus, so History's Activities badge reads (0), not (1).
    expect(historySection.getByRole("tab", { name: "Activities (0)" })).toBeInTheDocument();
  });

  it("floats a pinned note into a Pinned section above Focus, out of the History Notes list", () => {
    noteState.notes = [
      { id: "n1", body: "hi", createdAt: new Date("2026-07-01T00:00:00Z"), pinned: false },
      {
        id: "n2",
        body: "keep me on top",
        createdAt: new Date("2026-07-01T00:00:00Z"),
        pinned: true,
      },
    ];
    renderTabs();
    // The pinned note renders in its own Pinned region (above Focus), not in Focus or History.
    const pinnedSection = within(screen.getByRole("region", { name: "pinned" }));
    expect(pinnedSection.getByText("keep me on top")).toBeInTheDocument();
    const focusSection = within(screen.getByRole("region", { name: "focus" }));
    expect(focusSection.queryByText("keep me on top")).not.toBeInTheDocument();
    const historySection = within(screen.getByRole("region", { name: "history" }));
    expect(historySection.queryByText("keep me on top")).not.toBeInTheDocument();
    // The unpinned note still lives in History, and the Notes badge counts only that one.
    expect(historySection.getByText("hi")).toBeInTheDocument();
    expect(historySection.getByRole("tab", { name: "Notes (1)" })).toBeInTheDocument();
  });

  it("renders no Pinned section when no note is pinned", () => {
    renderTabs();
    expect(screen.queryByRole("region", { name: "pinned" })).not.toBeInTheDocument();
  });

  it("Focus shows the empty label when there are no open activities", () => {
    render(
      <WorkspaceTabs
        deal={deal}
        tab="all"
        onTab={() => {}}
        activities={[]}
        stages={stages}
        createdActorName="Nick"
      />,
    );
    const focusSection = within(screen.getByRole("region", { name: "focus" }));
    expect(focusSection.getByText("Nothing needs your attention")).toBeInTheDocument();
  });
});
