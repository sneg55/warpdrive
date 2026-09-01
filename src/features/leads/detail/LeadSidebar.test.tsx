// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Organization, Person } from "@/db/schema";
import type { CustomFieldDef } from "@/types/customFields";
import type { LeadDetail } from "../leadRepo";
import { LeadSidebar } from "./LeadSidebar";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    labels: { listByTarget: { useQuery: () => ({ data: [] }) } },
    enrichment: { status: { useQuery: () => ({ data: { ready: false, providers: [] } }) } },
    useUtils: () => ({ contacts: { contactTimeline: { invalidate: () => Promise.resolve() } } }),
  },
}));
const updateLeadAction = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve({ ok: true, value: { id: "l1", updatedAt: "2026-06-02T00:00:00.000Z" } }),
  ),
);
vi.mock("@/features/leads/leadServerActions", () => ({ updateLeadAction }));
// PersonBlock/OrgBlock (reused from the deal sidebar) save through these actions.
vi.mock("@/features/contacts/actions", () => ({
  updatePersonAction: vi.fn(() => Promise.resolve({ ok: true, value: {} })),
  updateOrgAction: vi.fn(() => Promise.resolve({ ok: true, value: {} })),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

afterEach(cleanup);

const basePerson: Person = {
  id: "pe1",
  name: "Jane Roe",
  firstName: "Jane",
  lastName: "Roe",
  primaryEmail: "jane@acme.com",
  emails: [{ label: "Work", value: "jane@acme.com", primary: true }],
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

const baseOrg: Organization = {
  id: "o1",
  name: "Acme Corp",
  address: { city: "Salt Lake City", region: "UT" },
  domain: "http://www.acme.com",
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

const baseLead: LeadDetail = {
  id: "l1",
  title: "Acme lead",
  value: null,
  personId: "pe1",
  orgId: "o1",
  ownerId: "u1",
  expectedCloseDate: null,
  labels: [],
  customFields: {},
  sourceChannel: null,
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
  personName: null,
  orgName: null,
  ownerName: null,
};

it("uses the shared Pipedrive field tokens (small, medium, right-aligned label)", () => {
  // Shared FieldRow token unified in the A3 sidebar pass: 12px / medium (500) / right-aligned,
  // matching the deal + person + org sidebars that render the same component.
  render(<LeadSidebar lead={baseLead} owners={[]} person={null} org={null} />);
  const label = screen.getByText("Channel ID");
  expect(label.className).toContain("text-xs");
  expect(label.className).toContain("font-medium");
  expect(label.className).toContain("text-right");
});

it("gives each section a kebab options menu but no misleading edit pencil", () => {
  // CO-2: LeadSidebar sections get the section kebab (Customize fields) + the hide-empty funnel.
  // The old "Edit {section}" pencil was removed: it only re-showed funnel-hidden fields (a
  // duplicate of the funnel toggle) while its label implied a section edit mode, so it read as a
  // dead control. Editing is via clicking a field inline or the header Edit button.
  render(<LeadSidebar lead={baseLead} owners={[]} person={null} org={null} />);
  const summary = within(screen.getByRole("region", { name: "Summary" }));
  expect(summary.queryByRole("button", { name: /Edit Summary section/i })).not.toBeInTheDocument();
  expect(summary.getByRole("button", { name: /Summary options/i })).toBeInTheDocument();
});

it("the Source section's hide-empty-fields funnel hides blank Channel ID row", () => {
  render(<LeadSidebar lead={baseLead} owners={[]} person={null} org={null} />);
  const sourceSection = within(screen.getByRole("region", { name: "Source" }));
  expect(sourceSection.getByText("Channel ID")).toBeInTheDocument();
  fireEvent.click(sourceSection.getByRole("button", { name: "Hide empty fields" }));
  expect(sourceSection.queryByText("Channel ID")).not.toBeInTheDocument();
  // Origin is never value-less; it always stays.
  expect(sourceSection.getByText("Origin")).toBeInTheDocument();
});

it("renders the linked person's contact fields (email) via the shared Person block", () => {
  // Parity with Pipedrive's lead sidebar: the Person section surfaces the linked person's
  // email/phone, not just the name, by reusing the deal sidebar's PersonBlock.
  render(<LeadSidebar lead={baseLead} owners={[]} person={basePerson} org={null} />);
  const personSection = within(screen.getByRole("region", { name: "Person" }));
  expect(personSection.getByText("Jane Roe")).toBeInTheDocument();
  expect(personSection.getByText("Email")).toBeInTheDocument();
  expect(personSection.getByText("jane@acme.com")).toBeInTheDocument();
});

it("uses the complete deal Person section and its section-wide edit action", () => {
  render(<LeadSidebar lead={baseLead} owners={[]} person={basePerson} org={null} />);
  const personSection = within(screen.getByRole("region", { name: "Person" }));
  expect(personSection.getByText("First name")).toBeInTheDocument();
  expect(personSection.getByText("Last name")).toBeInTheDocument();
  expect(personSection.getByText("Name")).toBeInTheDocument();
  fireEvent.click(personSection.getByRole("button", { name: "Edit Person section" }));
  expect(personSection.getByLabelText("First name")).toHaveValue("Jane");
  expect(personSection.getByLabelText("Last name")).toHaveValue("Roe");
  expect(personSection.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  expect(personSection.getByRole("button", { name: "Save" })).toBeInTheDocument();
});

it("no Person section when the lead has no linked (or a soft-deleted) person", () => {
  render(<LeadSidebar lead={baseLead} owners={[]} person={null} org={null} />);
  expect(screen.queryByRole("region", { name: "Person" })).not.toBeInTheDocument();
});

it("renders the linked org's website and firmographics via the shared Org block", () => {
  // The reported gap: PD shows the org's Website (and other firmographics) on the lead page; we
  // only showed Name. Reusing the deal sidebar's OrgBlock brings full parity.
  render(<LeadSidebar lead={baseLead} owners={[]} person={null} org={baseOrg} />);
  const orgSection = within(screen.getByRole("region", { name: "Organization" }));
  expect(orgSection.getByText("Acme Corp")).toBeInTheDocument();
  expect(orgSection.getByText("Website")).toBeInTheDocument();
  expect(orgSection.getByText("http://www.acme.com")).toBeInTheDocument();
  expect(orgSection.getByText("LinkedIn")).toBeInTheDocument();
  expect(orgSection.getByText("Industry")).toBeInTheDocument();
});

it("honors hidden built-in org fields (Settings > Data fields)", () => {
  render(
    <LeadSidebar
      lead={baseLead}
      owners={[]}
      person={null}
      org={baseOrg}
      hiddenOrgFields={new Set(["domain"])}
    />,
  );
  const orgSection = within(screen.getByRole("region", { name: "Organization" }));
  expect(orgSection.queryByText("Website")).not.toBeInTheDocument();
  // A non-hidden firmographic still renders.
  expect(orgSection.getByText("Industry")).toBeInTheDocument();
});

const leadDef = (over: Partial<CustomFieldDef>): CustomFieldDef => ({
  id: over.key ?? "id",
  targetEntity: "lead",
  type: "text",
  name: "F",
  key: "f",
  options: [],
  isRequired: false,
  isImportant: false,
  showInAddForm: false,
  order: 0,
  archivedAt: null,
  ...over,
});

it("renders one row per lead custom field inside the Organization section", () => {
  render(
    <LeadSidebar
      lead={{ ...baseLead, customFields: { grade: "A" } }}
      owners={[]}
      person={null}
      org={baseOrg}
      leadCustomFieldDefs={[leadDef({ key: "grade", name: "Grade" })]}
    />,
  );
  const section = within(screen.getByRole("region", { name: "Organization" }));
  expect(section.getByText("Grade")).toBeInTheDocument();
  expect(section.getByText("A")).toBeInTheDocument();
});

it("shows lead custom fields on an org-less lead as a bare Organization card", () => {
  render(
    <LeadSidebar
      lead={{ ...baseLead, customFields: {} }}
      owners={[]}
      person={null}
      org={null}
      leadCustomFieldDefs={[leadDef({ key: "grade", name: "Grade" })]}
    />,
  );
  const section = within(screen.getByRole("region", { name: "Organization" }));
  expect(section.getByText("Grade")).toBeInTheDocument();
});

it("saves an inline lead custom field through updateLeadAction", async () => {
  render(
    <LeadSidebar
      lead={{ ...baseLead, customFields: { grade: "A" } }}
      owners={[]}
      person={null}
      org={baseOrg}
      leadCustomFieldDefs={[leadDef({ key: "grade", name: "Grade" })]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit Grade" }));
  fireEvent.change(screen.getByLabelText("Grade"), { target: { value: "B" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await vi.waitFor(() =>
    expect(updateLeadAction).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: baseLead.id, customFields: { grade: "B" } }),
      "csrf",
    ),
  );
});
