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
          data: [
            {
              id: "d1",
              title: "Acme renewal",
              status: "won",
              stageId: "s2",
              value: "25000.00",
            },
          ],
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
  firstName: "Jane",
  lastName: "Roe",
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
  it("renders linked deals in the sidebar and opens the main panel on Activity", async () => {
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
    const header = screen.getByRole("banner");
    expect(header.parentElement?.firstElementChild).toBe(header);
    const dealsSection = within(screen.getByRole("region", { name: "Deals" }));
    expect(dealsSection.getByRole("link", { name: "Acme renewal, status won" })).toHaveAttribute(
      "href",
      "/deals/d1",
    );
    expect(dealsSection.getByLabelText("Deal status: Won")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Deals" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Focus" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "History" })).toBeInTheDocument();
    // Merge is now inside the header Options overflow (CO-3), not a standalone button.
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /contact actions/i }));
    expect(screen.getByRole("menuitem", { name: /merge duplicates/i })).toBeInTheDocument();
  });

  // Wave 4, Task 5: the header shows who owns the person via the shared OwnerBadge.

  it("renders the same complete Person section and bulk-edit action as the deal workspace", () => {
    render(
      <PersonDetailClient
        person={person as never}
        orgName="Acme Inc"
        defs={[]}
        canMerge={true}
        baseCurrency="USD"
      />,
    );
    const personSection = within(screen.getByRole("region", { name: "Person" }));
    expect(personSection.getByText("First name")).toBeInTheDocument();
    expect(personSection.getByText("Last name")).toBeInTheDocument();
    expect(personSection.getByRole("button", { name: /Person options/i })).toBeInTheDocument();
    fireEvent.click(personSection.getByRole("button", { name: /Edit Person section/i }));
    expect(personSection.getByLabelText("First name")).toHaveValue("Jane");
    expect(personSection.getByLabelText("Last name")).toHaveValue("Roe");
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

  it("omits the redundant header Edit action while keeping the Person section editable", () => {
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
      within(screen.getByRole("banner")).queryByRole("button", { name: /^edit$/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Edit Person section/i })).toBeInTheDocument();
  });
});

describe("PersonDetailClient composer + inline person section", () => {
  it("mounts the collapsed compose prompt and shared person field rows", () => {
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
    // The shared block repeats the linked display name from the header and exposes the same
    // editable name-part fields as the deal workspace.
    expect(screen.getAllByText("Jane Roe").length).toBeGreaterThan(0);
    expect(screen.getByText("First name")).toBeInTheDocument();
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

  it("saves an inline First name edit through the shared deal Person field", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Edit First name" }));
    const input = screen.getByLabelText("editor-firstName");
    fireEvent.change(input, { target: { value: "Janet" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(updatePersonAction).toHaveBeenCalled());
    expect(updatePersonAction).toHaveBeenCalledWith({ id: "pe1", firstName: "Janet" }, "tok");
  });
});
