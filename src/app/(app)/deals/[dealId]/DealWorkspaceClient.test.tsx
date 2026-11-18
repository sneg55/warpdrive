// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: () => {} }) }));

vi.mock("@/features/activities/actions", () => ({
  createActivityAction: vi.fn(),
  completeActivityAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "a1" } })),
  editActivityAction: vi.fn(),
  deleteActivityAction: vi.fn(),
}));

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
    intercom: { list: { useQuery: () => ({ data: undefined }) } },
    enrichment: { status: { useQuery: () => ({ data: { ready: false, providers: [] } }) } },
    useUtils: () => ({
      activities: {
        listForEntity: { invalidate: () => {}, setData: () => {} },
        dayLoad: { invalidate: () => Promise.resolve() },
        listRows: { invalidate: () => Promise.resolve() },
      },
      email: {
        listMessagesForDeal: { invalidate: () => {} },
        drafts: { listForDeal: { invalidate: () => {} } },
      },
    }),
    files: { listForEntity: { useQuery: () => ({ data: [] }) } },
    collaboration: {
      listNotes: { useQuery: () => ({ data: [] }) },
      listChangeLog: { useQuery: () => ({ data: [] }) },
    },
    email: {
      listMessagesForDeal: { useQuery: () => ({ data: [] }) },
      drafts: { listForDeal: { useQuery: () => ({ data: [] }) } },
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
      listTypes: { useQuery: () => ({ data: [] }) },
      availability: { useQuery: () => ({ data: { busy: false } }) },
      dayLoad: { useQuery: () => ({ data: undefined }) },
      getForEdit: { useQuery: () => ({ data: null }) },
    },
    labels: { listByTarget: { useQuery: () => ({ data: [] }) } },
    identity: {
      assignableUsers: { useQuery: () => ({ data: [] }) },
    },
    contacts: {
      listPeopleForOrg: { useQuery: () => ({ data: [] }) },
    },
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
    expect(screen.getAllByText("Acme renewal").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Proposal").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Call Acme").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Jane Roe").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Acme Inc").length).toBeGreaterThan(0);
  });

  it("refreshes the deal after an in-feed activity is completed (re-syncs the header's optimistic lock)", async () => {
    refresh.mockClear();
    render(<DealWorkspaceClient workspace={workspace as never} {...props} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /mark as done/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("marks the active stage with aria-current='step' and drops the 'to' connector text", () => {
    render(<DealWorkspaceClient workspace={workspace as never} {...props} />);
    const current = screen
      .getAllByText("Proposal")
      .map((el) => el.closest("[aria-current='step']"))
      .find((el) => el !== null);
    expect(current).toBeTruthy();
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
