// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Deal } from "@/db/schema";
import type { CalendarActivity } from "@/features/activities/calendar";
import { WorkspaceTabs } from "./tabs";

// Separate from tabs.test.tsx because the badge assertions need a populated Email and Files
// read, which the timeline tests there deliberately leave empty.
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      activities: { listForEntity: { setData: () => {}, invalidate: () => {} } },
      email: {
        listMessagesForDeal: { invalidate: () => {} },
        drafts: { listForDeal: { invalidate: () => {} } },
      },
    }),
    email: {
      listMessagesForDeal: {
        useQuery: () => ({
          data: [
            {
              id: "m1",
              messageId: "gm1",
              subject: "Feed not serving",
              snippet: "Hi Jie",
              fromName: "Nick",
              fromEmail: "sender@example.test",
              toEmails: ["recipient@example.test"],
              sentAt: new Date("2026-07-04T00:00:00Z"),
              direction: "outbound",
              threadId: "t1",
              hasAttachments: false,
            },
          ],
        }),
      },
      drafts: { listForDeal: { useQuery: () => ({ data: [] }) } },
      // EmailTimelineCard reads the body lazily; a collapsed card never fetches.
      message: { get: { useQuery: () => ({ data: undefined, isLoading: false }) } },
    },
    files: { listForEntity: { useQuery: () => ({ data: [{ id: "f1" }, { id: "f2" }] }) } },
    collaboration: {
      listNotes: {
        useQuery: () => ({
          data: [
            { id: "n1", body: "hi", createdAt: new Date("2026-07-01T00:00:00Z"), pinned: false },
          ],
        }),
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

afterEach(cleanup);

const deal = { id: "d1", createdAt: new Date("2026-06-01T00:00:00Z") } as unknown as Deal;

const stages = [
  { id: "stage-demo", name: "Demo" },
  { id: "stage-proposal", name: "Proposal" },
];

const doneActivity = {
  id: "a1",
  subject: "Call",
  dueAt: new Date("2026-07-03T00:00:00Z"),
  allDay: false,
  durationMinutes: null,
  typeKey: "call",
  done: true,
  dealId: "d1",
  personId: null,
  orgId: null,
  overdue: false,
  ownerName: "Nick",
} satisfies CalendarActivity;

function renderTabs(activities: CalendarActivity[]) {
  render(
    <WorkspaceTabs
      deal={deal}
      tab="all"
      onTab={() => {}}
      activities={activities}
      stages={stages}
      createdActorName="Nick"
    />,
  );
}

describe("History tab counts", () => {
  it("counts every tab, not just Activities and Notes", () => {
    renderTabs([doneActivity]);
    expect(screen.getByRole("tab", { name: "Activities (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Notes (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Email (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Files (2)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Changelog (1)" })).toBeInTheDocument();
    // All: the completed activity, the note, the email, the stage change, the created anchor.
    expect(screen.getByRole("tab", { name: "All (5)" })).toBeInTheDocument();
  });

  it("shows an empty tab's label alone instead of a (0) badge", () => {
    renderTabs([]);
    expect(screen.getByRole("tab", { name: "Activities" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /\(0\)/ })).not.toBeInTheDocument();
  });
});
