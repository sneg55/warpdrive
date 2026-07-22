// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

// DealCloseActions (Won/Lost) and the in-feed activity-complete path navigate via useRouter.
// Expose refresh as a spy so we can assert the deal is refreshed after an activity completes
// (which bumps deals.updatedAt, so the header's optimistic-lock precondition must re-sync).
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: () => {} }) }));

// Completing an activity in the timeline calls completeActivityAction; stub the whole actions
// module so the click resolves without a real server round-trip (other exports are unused here).
vi.mock("@/features/activities/actions", () => ({
  createActivityAction: vi.fn(),
  completeActivityAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "a1" } })),
  editActivityAction: vi.fn(),
  deleteActivityAction: vi.fn(),
}));

// DealHeader (extracted) reaches server actions, the websocket, and the csrf cookie via its leaf
// controls. Stub them so this test stays a pure render of the workspace shell (header behavior is
// covered by DealHeader.test.tsx and the per-control tests).
vi.mock("@/features/deal-workspace/actions", () => ({
  changeStageAction: vi.fn(),
  changeOwnerAction: vi.fn(),
  followDealAction: vi.fn(),
  unfollowDealAction: vi.fn(),
  deleteDealAction: vi.fn(),
  markWonAction: vi.fn(),
  markLostAction: vi.fn(),
}));
vi.mock("@/features/deals/archiveActions", () => ({ archiveDealAction: vi.fn() }));
vi.mock("@/features/deals/updateAction", () => ({ updateDealAction: vi.fn() }));
vi.mock("@/features/identity/preferencesActions", () => ({ setDealHeaderBlocksAction: vi.fn() }));
vi.mock("@/features/presence/ui/PresenceBar", () => ({ PresenceBar: () => null }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      activities: { listForEntity: { invalidate: () => {}, setData: () => {} } },
    }),
    collaboration: {
      listNotes: { useQuery: () => ({ data: [] }) },
      listChangeLog: { useQuery: () => ({ data: [] }) },
    },
    activities: {
      listForEntity: {
        useQuery: () => ({
          data: [
            {
              id: "a1",
              subject: "Call Acme",
              dueAt: new Date("2026-07-02T10:00:00Z"),
              typeKey: "call",
              done: false,
            },
          ],
        }),
      },
      // ComposeBar mounts ActivityComposerInline for real in this file's un-mocked render tree.
      listTypes: { useQuery: () => ({ data: [] }) },
      // The composer's Free/Busy hook (useComposerAvailability) queries this procedure.
      availability: { useQuery: () => ({ data: { busy: false } }) },
      // Inline edit: getForEdit is enabled only once an activity id is picked, so it stays idle here.
      getForEdit: { useQuery: () => ({ data: null }) },
    },
    labels: { listByTarget: { useQuery: () => ({ data: [] }) } },
    identity: {
      assignableUsers: { useQuery: () => ({ data: [] }) },
    },
    contacts: {
      listPeopleForOrg: { useQuery: () => ({ data: [] }) },
    },
    // The Summary action list's ParticipantsControl queries the deal's participants on render.
    deal: {
      participants: { useQuery: () => ({ data: [] }) },
    },
    realtime: {
      ticket: {
        useMutation: () => ({ mutateAsync: () => Promise.resolve({ ticket: "mock-ticket" }) }),
      },
    },
  },
}));

import { DealWorkspaceClient } from "./DealWorkspaceClient";
import { workspace } from "./dealWorkspaceFixture";

describe("DealWorkspaceClient", () => {
  const props = {
    selfActorId: "u1",
    emailAccountId: null,
    canChangeOwner: false,
    canDelete: true,
    assignableUsers: [],
    initialHiddenBlocks: [],
    baseCurrency: "USD",
    scheduleFollowUpAfterWon: false,
    hiddenOrgFields: new Set<string>(),
    hiddenPersonFields: new Set<string>(),
  };

  it("renders the title, stage progress, linked contacts, and next activity", () => {
    render(<DealWorkspaceClient workspace={workspace as never} {...props} />);
    // The title shows in the header AND (now) the composer's removable deal link chip.
    expect(screen.getAllByText("Acme renewal").length).toBeGreaterThan(0);
    // "Proposal" shows in both the breadcrumb and the stage selector.
    expect(screen.getAllByText("Proposal").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Call Acme").length).toBeGreaterThan(0);
    // The composer starts collapsed now, so these linked names come from the deal's own
    // header/linked-contacts blocks (the real ActivityComposerInline no longer renders on mount).
    expect(screen.getAllByText("Jane Roe").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Acme Inc").length).toBeGreaterThan(0);
  });

  it("refreshes the deal after an in-feed activity is completed (re-syncs the header's optimistic lock)", async () => {
    refresh.mockClear();
    render(<DealWorkspaceClient workspace={workspace as never} {...props} />);
    // The open "Call Acme" activity sits in Focus with a mark-as-done checkbox. Completing it
    // bumps deals.updatedAt server-side (recomputeNextActivity), so the page must refresh or the
    // header's frozen expectedUpdatedAt would fail the next stage-change CAS ("changed elsewhere").
    fireEvent.click(screen.getByRole("checkbox", { name: /mark as done/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("marks the active stage with aria-current='step' and drops the 'to' connector text", () => {
    render(<DealWorkspaceClient workspace={workspace as never} {...props} />);
    // Pipedrive-style chevron pipeline: the current segment is the active step,
    // and stages connect visually (no literal "to" word between them).
    const current = screen
      .getAllByText("Proposal")
      .map((el) => el.closest("[aria-current='step']"))
      .find((el) => el !== null);
    expect(current).toBeTruthy();
    // Scoped to the stage listbox: the activity composer (now mounted for real on the Activity
    // tab) has its own unrelated "Start time to End time" separator text elsewhere on the page.
    const stageBar = screen.getByRole("listbox", { name: "Stage" });
    expect(within(stageBar).queryByText("to")).not.toBeInTheDocument();
  });
});

describe("DealWorkspaceClient compose bar", () => {
  const props = {
    selfActorId: "u1",
    emailAccountId: null,
    canChangeOwner: false,
    canDelete: true,
    assignableUsers: [],
    initialHiddenBlocks: [],
    baseCurrency: "USD",
    scheduleFollowUpAfterWon: false,
    hiddenOrgFields: new Set<string>(),
    hiddenPersonFields: new Set<string>(),
  };

  it("mounts the composer as the PD default state (tabs visible, Activity prompt), expanding on click", () => {
    const { container } = render(<DealWorkspaceClient workspace={workspace as never} {...props} />);
    const composeSection = container.querySelector('section[aria-label="compose"]');
    if (composeSection === null) throw new Error("compose section not found");
    const compose = within(composeSection as HTMLElement);

    // Pipedrive parity: the tab strip is always visible; the Activity tab starts as a
    // one-line prompt below it, and clicking the prompt expands the activity editor.
    expect(compose.getByRole("tablist")).toBeInTheDocument();
    expect(compose.getByRole("tab", { name: "Activity" })).toHaveAttribute("aria-selected", "true");
    const prompt = compose.getByRole("button", { name: "Click here to add an activity..." });
    fireEvent.click(prompt);

    expect(
      compose.queryByRole("button", { name: "Click here to add an activity..." }),
    ).not.toBeInTheDocument();
    expect(compose.getByLabelText("Subject")).toBeInTheDocument();
  });
});

describe("DealWorkspaceClient block gating", () => {
  // Real-render gating checks (this file renders the true child tree, not mocked stubs). Markers:
  // ComposeBar renders <section aria-label="compose">; WorkspaceTabs renders an <h2>History</h2>.
  const baseProps = {
    selfActorId: "u1",
    emailAccountId: null,
    canChangeOwner: false,
    canDelete: true,
    assignableUsers: [],
    baseCurrency: "USD",
    scheduleFollowUpAfterWon: false,
    hiddenOrgFields: new Set<string>(),
    hiddenPersonFields: new Set<string>(),
  };

  it("hides the ComposeBar when the email block is hidden", () => {
    const { container } = render(
      <DealWorkspaceClient
        workspace={workspace as never}
        {...baseProps}
        initialHiddenBlocks={["email"]}
      />,
    );
    expect(container.querySelector('section[aria-label="compose"]')).toBeNull();
    expect(screen.getByRole("heading", { name: "History" })).toBeInTheDocument();
  });

  it("hides the WorkspaceTabs history when the timeline block is hidden", () => {
    const { container } = render(
      <DealWorkspaceClient
        workspace={workspace as never}
        {...baseProps}
        initialHiddenBlocks={["timeline"]}
      />,
    );
    expect(screen.queryByRole("heading", { name: "History" })).not.toBeInTheDocument();
    expect(container.querySelector('section[aria-label="compose"]')).not.toBeNull();
  });

  it("shows both when nothing is hidden", () => {
    const { container } = render(
      <DealWorkspaceClient
        workspace={workspace as never}
        {...baseProps}
        initialHiddenBlocks={[]}
      />,
    );
    expect(container.querySelector('section[aria-label="compose"]')).not.toBeNull();
    expect(screen.getByRole("heading", { name: "History" })).toBeInTheDocument();
  });
});
