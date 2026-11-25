// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
vi.mock("@/features/email/Composer", () => ({
  Composer: ({ draft }: { draft?: { subject: string } }) => (
    <div data-testid="composer">{draft === undefined ? "fresh" : `resumed:${draft.subject}`}</div>
  ),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    intercom: { list: { useQuery: () => ({ data: undefined }) } },
    brevo: { list: { useQuery: () => ({ data: undefined }) } },
    enrichment: { status: { useQuery: () => ({ data: { ready: false, providers: [] } }) } },
    useUtils: () => ({
      activities: { listForEntity: { invalidate: () => {}, setData: () => {} } },
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
      drafts: {
        listForDeal: {
          useQuery: () => ({
            data: [
              {
                id: "draft-1",
                subject: "Unsent outreach",
                bodyHtml: "<p>hi</p>",
                toEmails: ["poc@example.com"],
                ccEmails: [],
                threadId: null,
                accountId: "acct1",
                visibility: "shared",
                linkDealId: "d1",
                linkPersonId: null,
                updatedAt: "2026-08-19T10:00:00Z",
              },
            ],
          }),
        },
      },
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

const props = {
  selfActorId: "u1",
  emailAccountId: "acct1",
  canChangeOwner: false,
  canDelete: true,
  assignableUsers: [],
  initialHiddenBlocks: [],
  baseCurrency: "USD",
  scheduleFollowUpAfterWon: false,
  hiddenOrgFields: new Set<string>(),
  hiddenPersonFields: new Set<string>(),
};

describe("resuming a draft from the deal timeline", () => {
  it("opens the compose bar on that draft", async () => {
    render(<DealWorkspaceClient workspace={workspace as never} {...props} />);

    expect(screen.queryByTestId("composer")).not.toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: "Continue" })[0] as HTMLElement);

    expect(screen.getByTestId("composer")).toHaveTextContent("resumed:Unsent outreach");
  });
});
