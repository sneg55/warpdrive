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
      listPeopleForOrg: { useQuery: () => ({ data: [] }) },
      dealsForOrg: { useQuery: () => ({ data: [] }) },
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
  customFields: {},
  labels: [],
  ownerName: "Ann Owner",
};

import { OrgDetailClient } from "./OrgDetailClient";

describe("OrgDetailClient", () => {
  it("opens the edit dialog, prefilled with the org name, when Edit is clicked", () => {
    render(<OrgDetailClient org={org as never} defs={[]} canMerge={true} baseCurrency="USD" />);
    expect(screen.queryByRole("dialog", { name: /edit organization/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    expect(screen.getByRole("dialog", { name: /edit organization/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i, { selector: "input" })).toHaveValue("Acme Inc");
  });

  // CO-2: the org sidebar blocks (Summary / Details / Related organizations / Stats) are migrated
  // to collapsible sections with the section kebab (Customize fields) + hide-empty funnel. The old
  // "Edit section" pencil was removed (duplicated the funnel reveal; label implied a dead edit mode).
  it("renders the sidebar blocks as collapsible sections with kebab menus (no dead edit pencil)", () => {
    render(<OrgDetailClient org={org as never} defs={[]} canMerge={true} baseCurrency="USD" />);
    expect(screen.getByRole("region", { name: "Summary" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Details" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Related organizations" })).toBeInTheDocument();
    const stats = within(screen.getByRole("region", { name: "Stats" }));
    expect(stats.getByText("Open deals")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Summary options/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit Summary section/i })).not.toBeInTheDocument();
  });

  // Wave 4, Task 5: the header shows who owns the org via the shared OwnerBadge.
  it("inline-saves the Summary panel's Name through updateOrgAction", async () => {
    const { updateOrgAction } = await import("@/features/contacts/actions");
    render(<OrgDetailClient org={org as never} defs={[]} canMerge={true} baseCurrency="USD" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Name" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Acme Corp" } });
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Enter" });

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
