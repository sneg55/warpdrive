// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Deal } from "@/db/schema";
import type { CalendarActivity } from "@/features/activities/calendar";
import { WorkspaceTabs } from "./tabs";

const noteState = vi.hoisted(() => ({
  notes: [{ id: "n1", body: "hi", createdAt: new Date("2026-07-01T00:00:00Z"), pinned: false }],
}));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    intercom: { list: { useQuery: () => ({ data: undefined }) } },
    useUtils: () => ({
      activities: { listForEntity: { setData: () => {}, invalidate: () => {} } },
      email: {
        listMessagesForDeal: { invalidate: () => {} },
        drafts: { listForDeal: { invalidate: () => {} } },
      },
    }),
    email: {
      listMessagesForDeal: { useQuery: () => ({ data: [] }) },
      drafts: { listForDeal: { useQuery: () => ({ data: [] }) } },
    },
    files: { listForEntity: { useQuery: () => ({ data: [] }) } },
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
    allDay: false,
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
  expect(screen.getByRole("heading", { name: /Focus/ })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /History/ })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /Email/ })).toBeInTheDocument();
  expect(screen.queryByRole("tablist", { name: /Timeline view/ })).not.toBeInTheDocument();
});

describe("WorkspaceTabs", () => {
  it("Activities badge counts only the completed activities shown in History, not the unfiltered total", () => {
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
    expect(screen.getByText("Stage: Demo → Proposal")).toBeInTheDocument();
    expect(screen.queryByText("stage-proposal")).not.toBeInTheDocument();
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

  it("switches tabs via the onTab callback", async () => {
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
    await userEvent.click(screen.getByRole("tab", { name: "Notes (1)" }));
    expect(onTab).toHaveBeenCalledWith("notes");
  });

  it("Focus and History are both visible: Focus holds only the open activity, History holds the full log", () => {
    renderTabs();
    const focusSection = within(screen.getByRole("region", { name: "focus" }));
    const historySection = within(screen.getByRole("region", { name: "history" }));

    expect(focusSection.getByText("Call")).toBeInTheDocument();
    expect(focusSection.queryByText("Deal created")).not.toBeInTheDocument();
    expect(focusSection.queryByText("hi")).not.toBeInTheDocument();

    expect(historySection.getByText("Deal created")).toBeInTheDocument();
    expect(historySection.getByText("hi")).toBeInTheDocument();
    expect(historySection.getByRole("tab", { name: "Activities" })).toBeInTheDocument();
    expect(historySection.queryByRole("tab", { name: "Activities (1)" })).not.toBeInTheDocument();
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
    const pinnedSection = within(screen.getByRole("region", { name: "pinned" }));
    expect(pinnedSection.getByText("keep me on top")).toBeInTheDocument();
    const focusSection = within(screen.getByRole("region", { name: "focus" }));
    expect(focusSection.queryByText("keep me on top")).not.toBeInTheDocument();
    const historySection = within(screen.getByRole("region", { name: "history" }));
    expect(historySection.queryByText("keep me on top")).not.toBeInTheDocument();
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
