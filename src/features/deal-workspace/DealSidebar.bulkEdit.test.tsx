// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { CustomFieldDef } from "@/types/customFields";
import { DealSidebar } from "./DealSidebar";
import type { DealWorkspace } from "./summaryRepo";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

const { refresh, updateDealAction, updateOrgAction, updatePersonAction } = vi.hoisted(() => ({
  refresh: vi.fn(),
  updateDealAction: vi.fn(() =>
    Promise.resolve({ ok: true, deal: { id: "d1", updatedAt: "2026-01-03T00:00:00.000Z" } }),
  ),
  updateOrgAction: vi.fn(() => Promise.resolve({ ok: true, value: { id: "o1" } })),
  updatePersonAction: vi.fn(() => Promise.resolve({ ok: true, value: { id: "p1" } })),
}));
vi.mock("@/features/deals/updateAction", () => ({ updateDealAction }));
vi.mock("@/features/contacts/actions", () => ({ updateOrgAction, updatePersonAction }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ deal: { participants: { invalidate: vi.fn() } } }),
    labels: { listByTarget: { useQuery: () => ({ data: [] }) } },
    deal: { participants: { useQuery: () => ({ data: [] }) } },
    contacts: { listPeopleForOrg: { useQuery: () => ({ data: [] }) } },
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const textDef: CustomFieldDef = {
  id: "cf1",
  targetEntity: "deal",
  type: "text",
  name: "Industry",
  key: "industry",
  options: [],
  isRequired: false,
  isImportant: false,
  showInAddForm: false,
  order: 0,
  archivedAt: null,
};

function makeWorkspace(): DealWorkspace {
  return {
    deal: {
      id: "d1",
      title: "Acme",
      value: "1000.00",
      labels: [],
      sourceChannel: "outbound",
      sourceChannelId: "EXT-1",
      expectedCloseDate: null,
      customFields: { industry: "Media" },
      createdAt: new Date("2026-01-01T00:00:00Z"),
      lastActivityAt: null,
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    },
    ownerName: "Owner One",
    person: {
      id: "p1",
      name: "Ava Bauer",
      firstName: "Ava",
      lastName: "Bauer",
      primaryEmail: "ava@x.com",
      phones: [],
      emails: [],
      labels: [],
    },
    org: {
      id: "o1",
      name: "Org One",
      domain: null,
      industry: null,
      employeeCount: null,
      annualRevenue: null,
      linkedinUrl: null,
      address: null,
      labels: [],
    },
    customFieldDefs: [textDef],
  } as unknown as DealWorkspace;
}

it("the Person section pencil opens every field at once and saves them in one action call", async () => {
  render(
    <DealSidebar
      workspace={makeWorkspace()}
      now={new Date("2026-01-05T00:00:00Z")}
      isHidden={() => false}
      baseCurrency="USD"
    />,
  );

  const personSection = within(screen.getByRole("region", { name: "Person" }));
  // The header pencil enters section bulk-edit rather than the old reveal-empties no-op.
  fireEvent.click(personSection.getByRole("button", { name: "Edit Person section" }));

  // All editable Person fields are open simultaneously (First name + Last name inputs both present).
  const firstName = personSection.getByLabelText("First name");
  const lastName = personSection.getByLabelText("Last name");
  fireEvent.change(firstName, { target: { value: "Mia" } });
  fireEvent.change(lastName, { target: { value: "Stone" } });

  // A single Save commits the whole section in one call carrying only the changed fields.
  fireEvent.click(personSection.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => expect(updatePersonAction).toHaveBeenCalledTimes(1));
  expect(updatePersonAction).toHaveBeenCalledWith(
    { id: "p1", firstName: "Mia", lastName: "Stone" },
    "csrf",
  );
});

it("the Organization section pencil bulk-edits firmographics in one action call", async () => {
  render(
    <DealSidebar
      workspace={makeWorkspace()}
      now={new Date("2026-01-05T00:00:00Z")}
      isHidden={() => false}
      baseCurrency="USD"
    />,
  );

  const orgSection = within(screen.getByRole("region", { name: "Organization" }));
  fireEvent.click(orgSection.getByRole("button", { name: "Edit Organization section" }));

  fireEvent.change(orgSection.getByLabelText("Website"), { target: { value: "orgone.com" } });
  fireEvent.change(orgSection.getByLabelText("Industry"), { target: { value: "Retail" } });
  fireEvent.click(orgSection.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => expect(updateOrgAction).toHaveBeenCalledTimes(1));
  expect(updateOrgAction).toHaveBeenCalledWith(
    { id: "o1", domain: "orgone.com", industry: "Retail" },
    "csrf",
  );
});

it("inline-edits deal custom fields from inside the Organization section", async () => {
  render(
    <DealSidebar
      workspace={makeWorkspace()}
      now={new Date("2026-01-05T00:00:00Z")}
      isHidden={() => false}
      baseCurrency="USD"
    />,
  );

  const organization = within(screen.getByRole("region", { name: "Organization" }));
  expect(screen.queryByRole("region", { name: "Details" })).not.toBeInTheDocument();
  fireEvent.click(organization.getAllByRole("button", { name: "Edit Industry" }).at(-1)!);
  fireEvent.change(organization.getByLabelText("Industry"), { target: { value: "Finance" } });
  fireEvent.click(organization.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => expect(updateDealAction).toHaveBeenCalledTimes(1));
  expect(updateDealAction).toHaveBeenCalledWith(
    {
      dealId: "d1",
      expectedUpdatedAt: "2026-01-02T00:00:00.000Z",
      customFields: { industry: "Finance" },
    },
    "csrf",
  );
});

it("the Source section pencil bulk-edits channel + channel id in one action call", async () => {
  render(
    <DealSidebar
      workspace={makeWorkspace()}
      now={new Date("2026-01-05T00:00:00Z")}
      isHidden={() => false}
      baseCurrency="USD"
    />,
  );

  const sourceSection = within(screen.getByRole("region", { name: "Source" }));
  fireEvent.click(sourceSection.getByRole("button", { name: "Edit Source section" }));

  fireEvent.change(sourceSection.getByLabelText("Channel ID"), { target: { value: "EXT-9" } });
  fireEvent.click(sourceSection.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => expect(updateDealAction).toHaveBeenCalledTimes(1));
  expect(updateDealAction).toHaveBeenCalledWith(
    { dealId: "d1", expectedUpdatedAt: "2026-01-02T00:00:00.000Z", sourceChannelId: "EXT-9" },
    "csrf",
  );
});
