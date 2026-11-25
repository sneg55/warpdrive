// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { LeadDetail } from "@/features/leads/leadRepo";

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
vi.mock("@/features/contacts/actions", () => ({
  updatePersonAction: vi.fn(() => Promise.resolve({ ok: true, value: {} })),
  updateOrgAction: vi.fn(() => Promise.resolve({ ok: true, value: {} })),
}));

const { createActivityAction } = vi.hoisted(() => ({
  createActivityAction: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "a1" } })),
}));
vi.mock("@/features/activities/actions", () => ({ createActivityAction }));

const refetchTimeline = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    intercom: { list: { useQuery: () => ({ data: undefined }) } },
    brevo: { list: { useQuery: () => ({ data: undefined }) } },
    enrichment: { status: { useQuery: () => ({ data: { ready: false, providers: [] } }) } },
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
      dayLoad: { useQuery: () => ({ data: undefined }) },
    },
    labels: { listByTarget: { useQuery: () => ({ data: [] }) } },
    identity: {
      assignableUsers: { useQuery: () => ({ data: [] }) },
    },
    customFields: { listDefs: { useQuery: () => ({ data: [], isLoading: false }) } },
    contacts: {
      listPeople: { useQuery: () => ({ data: { rows: [], total: 0 } }) },
      listOrgs: { useQuery: () => ({ data: { rows: [], total: 0 } }) },
      listPeopleForOrg: { useQuery: () => ({ data: [] }) },
    },
    useUtils: () => ({
      lead: { list: { invalidate: vi.fn(async () => {}) } },
      activities: {
        dayLoad: { invalidate: vi.fn(async () => {}) },
        listRows: { invalidate: () => Promise.resolve() },
      },
    }),
  },
}));

import type { Organization, Person } from "@/db/schema";
import { LeadWorkspaceClient } from "./LeadWorkspaceClient";

const person: Person = {
  id: "pe1",
  name: "Jane Roe",
  firstName: "Jane",
  lastName: "Roe",
  primaryEmail: "jane@acme.com",
  emails: [],
  phones: [],
  orgId: "o1",
  ownerId: "u1",
  visibilityLevel: "owner",
  visibilityGroupId: null,
  visibleToUserIds: [],
  labels: [],
  customFields: {},
  searchTsv: "",
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
  deletedAt: null,
};

const org: Organization = {
  id: "o1",
  name: "Acme Inc",
  address: null,
  domain: null,
  industry: null,
  employeeCount: null,
  annualRevenue: null,
  linkedinUrl: null,
  ownerId: "u1",
  visibilityLevel: "owner",
  visibilityGroupId: null,
  visibleToUserIds: [],
  labels: [],
  customFields: {},
  searchTsv: "",
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
  deletedAt: null,
};

const NONE: ReadonlySet<string> = new Set();

function renderClient(over: Partial<LeadDetail> = {}) {
  return render(
    <LeadWorkspaceClient
      baseCurrency="USD"
      lead={{ ...lead, ...over }}
      person={person}
      org={org}
      hiddenPersonFields={NONE}
      hiddenOrgFields={NONE}
    />,
  );
}

const lead: LeadDetail = {
  id: "l1",
  title: "Acme lead",
  value: "1200.00",
  personId: "pe1",
  orgId: "o1",
  ownerId: "u1",
  expectedCloseDate: "2026-08-01",
  labels: ["hot"],
  customFields: {},
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
    renderClient();
    expect(screen.getByText("Acme lead")).toBeInTheDocument();
    expect(screen.getByText("Jane Roe")).toBeInTheDocument();
    expect(screen.getByText("Acme Inc")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Convert to deal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
    for (const tab of ["All", "Activities", "Notes", "Email"]) {
      expect(screen.getAllByRole("tab", { name: tab }).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("First touch")).toBeInTheDocument();
  });

  it("mounts the compose bar in the PD default state, scoped to the lead", () => {
    const { container } = renderClient();
    const composeSection = container.querySelector('section[aria-label="compose"]');
    if (composeSection === null) throw new Error("compose section not found");
    const compose = within(composeSection as HTMLElement);
    const tabs = compose.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Notes", "Activity"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(compose.getByRole("button", { name: "Take a note..." })).toBeInTheDocument();
    expect(compose.queryByRole("textbox", { name: "Note" })).not.toBeInTheDocument();
  });

  it("logs an activity from the lead's compose bar with leadId (and no dealId) in the payload", async () => {
    renderClient();
    fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
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
    await waitFor(() => expect(refetchTimeline).toHaveBeenCalled());
  });

  it("shows 'Converted' (disabled) when the lead already has a converted deal", () => {
    renderClient({ convertedDealId: "d9" });
    const btn = screen.getByRole("button", { name: "Converted" });
    expect(btn).toBeDisabled();
  });
});
