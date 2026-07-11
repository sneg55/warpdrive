// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  // cmdk (Combobox, used inside the real ActivityComposerInline) observes list size; jsdom has
  // none.
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
  updatePersonAction: vi.fn(() => Promise.resolve({ ok: true, value: { id: "pe1" } })),
  updateOrgAction: vi.fn(() => Promise.resolve({ ok: true, value: { id: "o1" } })),
  deletePersonAction: vi.fn(() => Promise.resolve({ ok: true, value: { id: "pe1" } })),
  deleteOrgAction: vi.fn(() => Promise.resolve({ ok: true, value: { id: "o1" } })),
  mergePersonsAction: vi.fn(),
  mergeOrgsAction: vi.fn(),
}));

// The Activity tab of SharedComposeBar mounts the REAL ActivityComposerInline (not mocked) so
// the person-scope anchor seam (dealId/leadId/personId/orgId) is actually exercised end to end,
// not just asserted against a stub. RichTextBody (TipTap) is mocked the same way
// ActivityComposerInline.test.tsx mocks it: a plain textarea stands in for the rich editor.
const { createActivityAction } = vi.hoisted(() => ({
  createActivityAction: vi.fn(() => Promise.resolve({ ok: true as const })),
}));
vi.mock("@/features/activities/actions", () => ({ createActivityAction }));
vi.mock("@/features/email/composer/RichTextBody", () => ({
  RichTextBody: ({ onChange }: { onChange: (h: string) => void }) => (
    <textarea aria-label="Note" onChange={(e) => onChange(e.target.value)} />
  ),
}));

vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    customFields: {
      hiddenBuiltins: {
        useQuery: () => ({ data: { person: [], organization: [], deal: [], activity: [] } }),
      },
    },
    useUtils: () => ({
      activities: { listForEntity: { invalidate: () => {} } },
      collaboration: { listNotes: { invalidate: () => {} } },
      contacts: {
        contactTimeline: { invalidate: () => {} },
        activityStats: { invalidate: () => {} },
      },
    }),
    contacts: {
      dealsForPerson: {
        useQuery: () => ({
          data: [{ id: "d1", title: "Acme renewal", stageId: "s2", value: "25000.00" }],
        }),
      },
      orgOptions: { useQuery: () => ({ data: [{ id: "o1", name: "Acme Inc" }] }) },
      personOptions: { useQuery: () => ({ data: [] }) },
      listPeopleForOrg: { useQuery: () => ({ data: [] }) },
      contactTimeline: { useQuery: () => ({ data: { items: [] } }) },
      activityStats: {
        useQuery: () => ({
          data: {
            total: 4,
            done: 3,
            open: 1,
            byType: { call: 3, email: 1 },
            lastActivityAt: new Date("2026-07-02T10:00:00Z"),
            inactiveDays: 5,
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
    identity: {
      assignableUsers: { useQuery: () => ({ data: [] }) },
    },
  },
}));

const person = {
  id: "pe1",
  name: "Jane Roe",
  primaryEmail: "jane@acme.com",
  emails: [{ label: "work", value: "jane@acme.com", primary: true }],
  phones: [{ label: "mobile", value: "+14155550100", primary: true }],
  orgId: "o1",
  customFields: {},
  labels: [],
  ownerName: "Ann Owner",
};

import { PersonDetailClient } from "./PersonDetailClient";

describe("PersonDetailClient", () => {
  it("renders name, contact points, the linked deals on the default Deals tab, and a merge action", async () => {
    render(
      <PersonDetailClient
        person={person as never}
        orgName="Acme Inc"
        defs={[]}
        canMerge={true}
        baseCurrency="USD"
      />,
    );
    // "Jane Roe" now appears twice: the header <h1> and the inline-editable Name row.
    expect(screen.getAllByText("Jane Roe").length).toBeGreaterThan(0);
    expect(screen.getByText("jane@acme.com")).toBeInTheDocument();
    expect(screen.getByText("+14155550100")).toBeInTheDocument();
    expect(screen.getByText("Acme renewal")).toBeInTheDocument();
    // Merge is now inside the header Options overflow (CO-3), not a standalone button.
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /contact actions/i }));
    expect(screen.getByRole("menuitem", { name: /merge duplicates/i })).toBeInTheDocument();
  });

  // Wave 4, Task 5: the header shows who owns the person via the shared OwnerBadge.

  // CO-2: the sidebar Contact block is a collapsible section with the section kebab (Customize
  // fields) + hide-empty funnel. The old "Edit section" pencil was removed (it only duplicated the
  // funnel's reveal while its label implied a non-existent section edit mode).
  it("renders the sidebar Contact section as a collapsible region with a kebab (no dead edit pencil)", () => {
    render(
      <PersonDetailClient
        person={person as never}
        orgName="Acme Inc"
        defs={[]}
        canMerge={true}
        baseCurrency="USD"
      />,
    );
    expect(screen.getByRole("region", { name: "Contact" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Contact options/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit Contact section/i })).not.toBeInTheDocument();
  });

  it("renders a person Overview section sourced from activityStats", () => {
    render(
      <PersonDetailClient
        person={person as never}
        orgName="Acme Inc"
        defs={[]}
        canMerge={true}
        baseCurrency="USD"
      />,
    );
    const overview = within(screen.getByRole("region", { name: "Overview" }));
    expect(overview.getByText("Total activities")).toBeInTheDocument();
    expect(overview.getByText("4")).toBeInTheDocument();
    expect(overview.getByText("Inactive")).toBeInTheDocument();
  });

  it("opens the edit dialog, prefilled, when the Edit button is clicked", () => {
    render(
      <PersonDetailClient
        person={person as never}
        orgName="Acme Inc"
        defs={[]}
        canMerge={true}
        baseCurrency="USD"
      />,
    );
    expect(screen.queryByRole("dialog", { name: /edit person/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    const dialog = screen.getByRole("dialog", { name: /edit person/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i, { selector: "input" })).toHaveValue("Jane Roe");
  });
});

describe("PersonDetailClient composer + inline summary", () => {
  it("mounts the collapsed compose prompt and the inline-editable Name field", () => {
    render(
      <PersonDetailClient
        person={person as never}
        orgName="Acme Inc"
        defs={[]}
        canMerge={true}
        baseCurrency="USD"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Click here to add an activity..." }),
    ).toBeInTheDocument();
    // The panel's Name row renders the person's name as a click-to-edit button (same text
    // node the header <h1> also shows), so at least one instance must be present.
    expect(screen.getAllByText("Jane Roe").length).toBeGreaterThan(0);
  });

  it("creates an activity anchored to this person (personId set, dealId/leadId null) through the real composer, not a mocked stub", async () => {
    render(
      <PersonDetailClient
        person={person as never}
        orgName="Acme Inc"
        defs={[]}
        canMerge={true}
        baseCurrency="USD"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Click here to add an activity..." }));
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Intro call" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(createActivityAction).toHaveBeenCalled());
    const [payload] = createActivityAction.mock.calls[0] as unknown as [
      Record<string, unknown>,
      string,
    ];
    expect(payload.personId).toBe("pe1");
    expect(payload.dealId).toBeNull();
    expect(payload.leadId).toBeNull();
    expect(payload.orgId).toBe("o1");
  });

  it("saves an inline Name edit through updatePersonAction (partial by id)", async () => {
    const { updatePersonAction } = await import("@/features/contacts/actions");
    render(
      <PersonDetailClient
        person={person as never}
        orgName="Acme Inc"
        defs={[]}
        canMerge={true}
        baseCurrency="USD"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit Name" }));
    const input = screen.getByLabelText("Name");
    fireEvent.change(input, { target: { value: "Jane Smith" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await vi.waitFor(() => expect(updatePersonAction).toHaveBeenCalled());
    expect(updatePersonAction).toHaveBeenCalledWith({ id: "pe1", name: "Jane Smith" }, "tok");
  });
});
