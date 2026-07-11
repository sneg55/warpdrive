// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { CustomFieldDef } from "@/types/customFields";
import { DealSidebar } from "./DealSidebar";
import type { DealWorkspace } from "./summaryRepo";

// Details section renders one FieldRow per custom field def. Mocked module boundaries mirror
// DealSidebar.test.tsx (LabelRow/OrgBlock/PersonBlock all reach these on render).
const updateDealAction = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve({ ok: true, deal: { id: "d1", updatedAt: "2026-01-03T00:00:00.000Z" } }),
  ),
);
vi.mock("@/features/deals/updateAction", () => ({ updateDealAction }));
vi.mock("@/features/contacts/actions", () => ({
  updateOrgAction: vi.fn(),
  updatePersonAction: vi.fn(),
}));
// ParticipantsControl (Summary action list) queries tRPC on render; stub it.
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({ deal: { participants: { invalidate: vi.fn() } } }),
    labels: { listByTarget: { useQuery: () => ({ data: [] }) } },
    deal: { participants: { useQuery: () => ({ data: [] }) } },
    contacts: { listPeopleForOrg: { useQuery: () => ({ data: [] }) } },
  },
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);

const def = (over: Partial<CustomFieldDef>): CustomFieldDef => ({
  id: "d",
  targetEntity: "deal",
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

function makeWorkspace(customFieldDefs: CustomFieldDef[], customFields: Record<string, unknown>) {
  return {
    deal: {
      id: "d1",
      title: "Acme",
      value: "1000.00",
      labels: [],
      sourceChannel: "outbound",
      sourceChannelId: null,
      expectedCloseDate: null,
      customFields,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      lastActivityAt: null,
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    },
    ownerName: "Owner One",
    person: null,
    org: null,
    customFieldDefs,
  } as unknown as DealWorkspace;
}

const showAll = (): boolean => false;

it("inline-edits a text custom field through the deal update action (customFields patch)", async () => {
  render(
    <DealSidebar
      workspace={makeWorkspace([def({ id: "d1", key: "notes", name: "Notes", type: "text" })], {
        notes: "hello",
      })}
      now={new Date("2026-01-05T00:00:00Z")}
      isHidden={showAll}
      baseCurrency="USD"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Edit Notes" }));
  fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "world" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await vi.waitFor(() =>
    expect(updateDealAction).toHaveBeenCalledWith(
      {
        dealId: "d1",
        expectedUpdatedAt: "2026-01-02T00:00:00.000Z",
        customFields: { notes: "world" },
      },
      "csrf",
    ),
  );
});

it("does not render a Probability row in the Details section", () => {
  render(
    <DealSidebar
      workspace={makeWorkspace([def({ id: "d1", key: "notes", name: "Notes" })], { notes: "x" })}
      now={new Date()}
      isHidden={showAll}
      baseCurrency="USD"
    />,
  );
  const detailsSection = within(screen.getByRole("region", { name: "Details" }));
  expect(detailsSection.queryByText("Probability")).not.toBeInTheDocument();
});

it("the Details section's hide-empty-fields funnel hides a blank custom field row", () => {
  const customFieldDefs = [
    def({ id: "d1", key: "notes", name: "Notes" }),
    def({ id: "d2", key: "budget", name: "Budget", type: "monetary" }),
  ];
  render(
    <DealSidebar
      workspace={makeWorkspace(customFieldDefs, { notes: "", budget: 500 })}
      now={new Date()}
      isHidden={showAll}
      baseCurrency="USD"
    />,
  );
  const detailsSection = within(screen.getByRole("region", { name: "Details" }));
  expect(detailsSection.getByText("Notes")).toBeInTheDocument();
  expect(detailsSection.getByText("Budget")).toBeInTheDocument();
  fireEvent.click(detailsSection.getByRole("button", { name: "Hide empty fields" }));
  expect(detailsSection.queryByText("Notes")).not.toBeInTheDocument();
  // Budget has a real value, so it stays.
  expect(detailsSection.getByText("Budget")).toBeInTheDocument();
});
