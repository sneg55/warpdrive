// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { CustomFieldDef } from "@/types/customFields";
import { DealSidebar } from "./DealSidebar";
import type { DealWorkspace } from "./summaryRepo";

vi.mock("@/features/deals/updateAction", () => ({
  updateDealAction: vi.fn(() =>
    Promise.resolve({ ok: true, deal: { id: "d1", updatedAt: "2026-01-03T00:00:00.000Z" } }),
  ),
}));
vi.mock("@/features/contacts/actions", () => ({
  updateOrgAction: vi.fn(() => Promise.resolve({ ok: true, value: { id: "o1" } })),
  updatePersonAction: vi.fn(() => Promise.resolve({ ok: true, value: { id: "p1" } })),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// ParticipantsControl (Summary action list) queries tRPC on render.
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ deal: { participants: { invalidate: vi.fn() } } }),
    labels: { listByTarget: { useQuery: () => ({ data: [] }) } },
    deal: { participants: { useQuery: () => ({ data: [] }) } },
    contacts: { listPeopleForOrg: { useQuery: () => ({ data: [] }) } },
  },
}));

afterEach(cleanup);

const fieldDef: CustomFieldDef = {
  id: "cf-industry",
  targetEntity: "deal",
  type: "text",
  name: "Deal segment",
  key: "deal_segment",
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
      sourceChannelId: null,
      expectedCloseDate: null,
      customFields: { deal_segment: "Manufacturing" },
      createdAt: new Date("2026-01-01T00:00:00Z"),
      lastActivityAt: null,
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    },
    ownerName: "Owner One",
    person: {
      id: "p1",
      name: "Person One",
      firstName: "Person",
      lastName: "One",
      primaryEmail: "p@example.com",
      phones: [],
      emails: [],
      labels: [],
    },
    org: {
      id: "o1",
      name: "Org One",
      domain: "org.example",
      industry: "Media",
      employeeCount: null,
      annualRevenue: null,
      linkedinUrl: null,
      address: null,
      labels: [],
    },
    customFieldDefs: [fieldDef],
  } as unknown as DealWorkspace;
}

function expectSharedLeftValue(sectionName: string, label: string): void {
  const section = within(screen.getByRole("region", { name: sectionName }));
  const labelEl = section.getByText(label);
  const row = labelEl.closest("[data-testid='field-row']");
  expect(row).not.toBeNull();
  const value = within(row as HTMLElement).getByTestId("field-row-value");
  expect(value.className).toContain("text-left");
  expect(value.className).not.toContain("text-right");
}

function expectLabelAlign(sectionName: string, label: string, align: "left" | "right"): void {
  const section = within(screen.getByRole("region", { name: sectionName }));
  const labelEl = section.getByText(label);
  const row = labelEl.closest("[data-testid='field-row']");
  expect(row).not.toBeNull();
  // The label token is the first grid child (icon + text); assert its justify/text alignment.
  const labelSpan = (row as HTMLElement).firstElementChild as HTMLElement;
  if (align === "left") {
    expect(labelSpan.className).toContain("text-left");
    expect(labelSpan.className).not.toContain("text-right");
  } else {
    expect(labelSpan.className).toContain("text-right");
    expect(labelSpan.className).not.toContain("text-left");
  }
}

it("renders Summary as PD's action list (no field-label column), other sections right-aligned", () => {
  render(
    <DealSidebar
      workspace={makeWorkspace()}
      now={new Date("2026-01-05T00:00:00Z")}
      isHidden={() => false}
      baseCurrency="USD"
    />,
  );

  // Summary is an action list now (PD parity): no "Value"/"Owner" label tokens, the value
  // renders as formatted currency, and no FieldRow grid exists inside the section.
  const summary = within(screen.getByRole("region", { name: "Summary" }));
  expect(summary.queryByText("Value")).not.toBeInTheDocument();
  expect(summary.queryByText("Owner")).not.toBeInTheDocument();
  expect(summary.getByText("$1,000")).toBeInTheDocument();
  expect(summary.queryAllByTestId("field-row")).toHaveLength(0);
  // Every other section keeps the right-aligned label default.
  expectLabelAlign("Organization", "Deal segment", "right");
  expectLabelAlign("Person", "Name", "right");
});

it("renders representative sidebar values through the shared left-aligned FieldRow", () => {
  render(
    <DealSidebar
      workspace={makeWorkspace()}
      now={new Date("2026-01-05T00:00:00Z")}
      isHidden={() => false}
      baseCurrency="USD"
    />,
  );

  expectSharedLeftValue("Organization", "Deal segment");
  expectSharedLeftValue("Organization", "Name");
  expectSharedLeftValue("Person", "Name");
  expectSharedLeftValue("Source", "Channel");
});
