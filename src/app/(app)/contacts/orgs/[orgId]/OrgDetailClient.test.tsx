// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  // ActivityComposerInline (rendered for real below, un-mocked) uses cmdk/Radix pieces that
  // reach for browser APIs jsdom does not implement.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  global.ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "tok" }));
vi.mock("@/features/contacts/actions", () => ({
  updatePersonAction: vi.fn(),
  updateOrgAction: vi.fn(() => Promise.resolve({ ok: true, value: { id: "o1" } })),
  mergePersonsAction: vi.fn(),
  mergeOrgsAction: vi.fn(),
}));
vi.mock("@/features/contacts/orgRelationActions", () => ({
  addOrgRelationAction: vi.fn(() => Promise.resolve({ ok: true })),
  removeOrgRelationAction: vi.fn(() => Promise.resolve({ ok: true })),
}));

const { createActivityAction } = vi.hoisted(() => ({
  createActivityAction: vi.fn(() => Promise.resolve({ ok: true as const })),
}));
vi.mock("@/features/activities/actions", () => ({ createActivityAction }));

const invalidateNotes = vi.fn();
const invalidateContactTimeline = vi.fn();
const invalidateRelatedOrgs = vi.fn();
const invalidateActivityStats = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    customFields: {
      hiddenBuiltins: {
        useQuery: () => ({ data: { person: [], organization: [], deal: [], activity: [] } }),
      },
    },
    contacts: {
      listPeopleForOrg: { useQuery: () => ({ data: [{ id: "p1", name: "Jane Roe" }] }) },
      dealsForOrg: {
        useQuery: () => ({ data: [{ id: "d1", title: "Acme renewal", status: "open" }] }),
      },
      orgOptions: { useQuery: () => ({ data: [] }) },
      contactTimeline: { useQuery: () => ({ data: { items: [] } }) },
      relatedOrgs: { useQuery: () => ({ data: [] }) },
      activityStats: {
        useQuery: () => ({
          data: {
            total: 0,
            done: 0,
            open: 0,
            byType: {},
            lastActivityAt: null,
            inactiveDays: null,
          },
        }),
      },
    },
    collaboration: {
      listNotes: { useQuery: () => ({ data: [] }) },
      listChangeLog: { useQuery: () => ({ data: [] }) },
    },
    activities: {
      listForEntity: { useQuery: () => ({ data: [] }) },
      listTypes: { useQuery: () => ({ data: [{ id: "t1", key: "call", name: "Call" }] }) },
      availability: { useQuery: () => ({ data: { busy: false } }) },
    },
    labels: { listByTarget: { useQuery: () => ({ data: [] }) } },
    identity: { assignableUsers: { useQuery: () => ({ data: [] }) } },
    useUtils: () => ({
      collaboration: { listNotes: { invalidate: invalidateNotes } },
      contacts: {
        contactTimeline: { invalidate: invalidateContactTimeline },
        relatedOrgs: { invalidate: invalidateRelatedOrgs },
        activityStats: { invalidate: invalidateActivityStats },
      },
    }),
  },
}));

const org = {
  id: "o1",
  name: "Acme Inc",
  address: null,
  domain: null,
  industry: null,
  employeeCount: null,
  annualRevenue: null,
  linkedinUrl: null,
  customFields: {},
  labels: [],
  ownerName: "Ann Owner",
};

import { OrgDetailClient } from "./OrgDetailClient";

describe("OrgDetailClient", () => {
  it("omits the redundant header Edit action while keeping the Organization section editable", () => {
    render(<OrgDetailClient org={org as never} defs={[]} canMerge={true} baseCurrency="USD" />);
    expect(
      within(screen.getByRole("banner")).queryByRole("button", { name: /^edit$/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Edit Organization section/i })).toBeInTheDocument();
  });

  it("renders one shared Organization section instead of separate Summary and Details cards", () => {
    render(<OrgDetailClient org={org as never} defs={[]} canMerge={true} baseCurrency="USD" />);
    expect(screen.getByRole("region", { name: "Organization" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Summary" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Details" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Related organizations" })).toBeInTheDocument();
    const stats = within(screen.getByRole("region", { name: "Stats" }));
    expect(stats.getByText("Open deals")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Organization options/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Edit Organization section/i })).toBeInTheDocument();
  });

  it("renders People and Deals in the sidebar and opens the main panel on Activity", () => {
    render(<OrgDetailClient org={org as never} defs={[]} canMerge={true} baseCurrency="USD" />);

    const header = screen.getByRole("banner");
    expect(header.parentElement?.firstElementChild).toBe(header);
    const people = within(screen.getByRole("region", { name: "People" }));
    expect(people.getByRole("link", { name: "Jane Roe" })).toHaveAttribute(
      "href",
      "/contacts/people/p1",
    );
    const deals = within(screen.getByRole("region", { name: "Deals" }));
    expect(deals.getByRole("link", { name: "Acme renewal, status open" })).toHaveAttribute(
      "href",
      "/deals/d1",
    );
    expect(deals.getByLabelText("Deal status: Open")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "People" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Deals" })).not.toBeInTheDocument();
    const mainTabList = screen.getAllByRole("tablist").find((tabList) => {
      const tabs = within(tabList);
      return (
        tabs.queryByRole("tab", { name: "Activity" }) !== null &&
        tabs.queryByRole("tab", { name: "Email" }) !== null
      );
    });
    if (mainTabList === undefined) throw new Error("main organization tab list not found");
    const mainTabs = within(mainTabList);
    expect(mainTabs.getByRole("tab", { name: "Activity" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  // Wave 4, Task 5: the header shows who owns the org via the shared OwnerBadge.
  it("inline-saves the Organization section's Name through updateOrgAction", async () => {
    const { updateOrgAction } = await import("@/features/contacts/actions");
    render(<OrgDetailClient org={org as never} defs={[]} canMerge={true} baseCurrency="USD" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Name" }));
    fireEvent.change(screen.getByLabelText("editor-name"), { target: { value: "Acme Corp" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(updateOrgAction).toHaveBeenCalled());
    expect(updateOrgAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: "o1", name: "Acme Corp" }),
      "tok",
    );
  });
});

// Task 14 reviewer directive: exercise the REAL (unmocked) composer path for this scope and
// assert a created activity's payload carries this entity's own id in the field that matches
// its scope, and none of the sibling entity id fields. Mirrors DealWorkspaceClient's coverage,
// generalized to org: orgId is set, dealId/leadId/personId are all null (an org has no
// deal/lead/person parent implied by ComposeScope alone).
describe("OrgDetailClient composer seam", () => {
  it("creates an activity anchored to this org's orgId, not a dealId/leadId/personId", async () => {
    const { container } = render(
      <OrgDetailClient org={org as never} defs={[]} canMerge={true} baseCurrency="USD" />,
    );
    const composeSection = container.querySelector('section[aria-label="compose"]');
    if (composeSection === null) throw new Error("compose section not found");
    const compose = within(composeSection as HTMLElement);

    fireEvent.click(compose.getByRole("button", { name: "Click here to add an activity..." }));
    fireEvent.change(compose.getByLabelText("Subject"), { target: { value: "Check in" } });
    fireEvent.click(compose.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(createActivityAction).toHaveBeenCalled());
    const [payload] = createActivityAction.mock.calls[0] as unknown as [
      Record<string, unknown>,
      string,
    ];
    expect(payload.orgId).toBe("o1");
    expect(payload.dealId).toBeNull();
    expect(payload.leadId).toBeNull();
    expect(payload.personId).toBeNull();

    await vi.waitFor(() =>
      expect(invalidateContactTimeline).toHaveBeenCalledWith({
        entityType: "organization",
        entityId: "o1",
      }),
    );
    // codex P2: the Overview stats must refresh on a new activity, not just the timeline.
    expect(invalidateActivityStats).toHaveBeenCalledWith({
      entityType: "organization",
      entityId: "o1",
    });
  });
});
