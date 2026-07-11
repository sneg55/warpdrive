// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { LeadDetail } from "@/features/leads/leadRepo";

// The Due date field is now the shared DatePicker (Radix Popover), whose
// pointer APIs jsdom does not implement. Polyfill them so the popover opens.
// cmdk (Combobox, used inside ActivityComposerInline's Owner field) observes list
// size to manage height; jsdom has no ResizeObserver, so stub it too. The compose
// bar renders the REAL ActivityComposerInline here (not mocked), so these are
// needed for the seam test below to actually mount the overlay-bearing composer.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  global.ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
});

afterEach(cleanup);

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/features/leads/leadServerActions", () => ({
  convertLeadAction: vi.fn(),
  archiveLeadAction: vi.fn(),
  bulkUpdateLeadsAction: vi.fn(),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

const { createActivityAction } = vi.hoisted(() => ({
  createActivityAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "a1" } })),
}));
vi.mock("@/features/activities/actions", () => ({ createActivityAction }));

const refetchTimeline = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    lead: {
      leadTimeline: {
        useQuery: () => ({
          refetch: refetchTimeline,
          data: {
            items: [
              {
                id: "n1",
                kind: "note",
                at: new Date("2026-07-01T00:00:00Z"),
                body: "First touch",
                actorName: "Nick",
              },
            ],
            emails: [],
          },
        }),
      },
    },
    activities: {
      listTypes: { useQuery: () => ({ data: [{ id: "t1", key: "call", name: "Call" }] }) },
      availability: { useQuery: () => ({ data: { busy: false } }) },
    },
    // ActivityComposerInline (mounted for real via SharedComposeBar in this file's
    // un-mocked render tree) also reads these two.
    labels: { listByTarget: { useQuery: () => ({ data: [] }) } },
    identity: {
      assignableUsers: { useQuery: () => ({ data: [] }) },
    },
    contacts: {
      listPeople: { useQuery: () => ({ data: { rows: [], total: 0 } }) },
      listOrgs: { useQuery: () => ({ data: { rows: [], total: 0 } }) },
      listPeopleForOrg: { useQuery: () => ({ data: [] }) },
    },
  },
}));

import { LeadWorkspaceClient } from "./LeadWorkspaceClient";

const lead: LeadDetail = {
  id: "l1",
  title: "Acme lead",
  value: "1200.00",
  personId: "pe1",
  orgId: "o1",
  ownerId: "u1",
  expectedCloseDate: "2026-08-01",
  labels: ["hot"],
  sourceChannel: "inbound",
  sourceChannelId: null,
  sourceOrigin: "manually_created",
  visibilityLevel: "owner",
  visibilityGroupId: null,
  visibleToUserIds: [],
  lastActivityAt: null,
  nextActivityAt: null,
  convertedDealId: null,
  archivedAt: null,
  deletedAt: null,
  searchTsv: "'acme':1 'lead':2",
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
  personName: "Jane Roe",
  orgName: "Acme Inc",
  ownerName: "Nick",
};

describe("LeadWorkspaceClient", () => {
  it("renders the lead title, sidebar contacts, Convert/Archive actions, and timeline tabs", () => {
    render(<LeadWorkspaceClient lead={lead} />);
    expect(screen.getByText("Acme lead")).toBeInTheDocument();
    expect(screen.getByText("Jane Roe")).toBeInTheDocument();
    expect(screen.getByText("Acme Inc")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Convert to deal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
    // The compose bar's always-visible strip also has "Notes"/"Email" tabs, so assert
    // the timeline tabs exist without requiring uniqueness across the page.
    for (const tab of ["All", "Activities", "Notes", "Email"]) {
      expect(screen.getAllByRole("tab", { name: tab }).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("First touch")).toBeInTheDocument();
  });

  it("mounts the compose bar in the PD default state, scoped to the lead", () => {
    const { container } = render(<LeadWorkspaceClient lead={lead} />);
    const composeSection = container.querySelector('section[aria-label="compose"]');
    if (composeSection === null) throw new Error("compose section not found");
    const compose = within(composeSection as HTMLElement);
    // The compose tab strip is always visible (the timeline below has its own unrelated
    // All/Activities/Notes/Email tablist, hence the compose-scoped queries).
    expect(compose.getByRole("tab", { name: "Activity" })).toBeInTheDocument();
    expect(
      compose.getByRole("button", { name: "Click here to add an activity..." }),
    ).toBeInTheDocument();
    // Collapsed: the activity editor itself is not mounted yet.
    expect(compose.queryByLabelText("Subject")).not.toBeInTheDocument();
  });

  // MANDATORY seam test (Task 14 reviewer directive): SharedComposeBar.test.tsx mocks
  // ActivityComposerInline, so it never proves the scope->anchor wiring for non-deal
  // scopes. This test renders the REAL ActivityComposerInline (via the real, un-mocked
  // SharedComposeBar) to prove that logging an activity from the lead's composer sends
  // leadId (and no dealId) in the created-activity payload, so it files under this lead
  // and not a phantom deal.
  it("logs an activity from the lead's compose bar with leadId (and no dealId) in the payload", async () => {
    render(<LeadWorkspaceClient lead={lead} />);
    fireEvent.click(screen.getByRole("button", { name: "Click here to add an activity..." }));
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Intro call" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(createActivityAction).toHaveBeenCalledWith(
        expect.objectContaining({
          leadId: "l1",
          dealId: null,
          subject: "Intro call",
        }),
        expect.anything(),
      ),
    );
    // The composer refreshes the lead timeline after a successful create.
    await waitFor(() => expect(refetchTimeline).toHaveBeenCalled());
  });

  it("shows 'Converted' (disabled) when the lead already has a converted deal", () => {
    render(<LeadWorkspaceClient lead={{ ...lead, convertedDealId: "d9" }} />);
    const btn = screen.getByRole("button", { name: "Converted" });
    expect(btn).toBeDisabled();
  });
});
