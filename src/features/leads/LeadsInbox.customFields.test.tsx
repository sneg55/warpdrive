// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CustomFieldDef } from "@/types/customFields";
import "@/components/data-table/ColumnsMenuSortableList";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@/components/shell/ActionErrorProvider", () => ({
  useActionError: () => vi.fn(),
}));

const refetch = vi.fn();
const listQuery = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/leads",
}));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    lead: { list: { useQuery: (...a: unknown[]) => listQuery(...a) } },
    identity: { assignableUsers: { useQuery: () => ({ data: [] }) } },
    customFields: { listDefs: { useQuery: () => ({ data: [], isLoading: false }) } },
    labels: {
      listByTarget: { useQuery: () => ({ data: [] }) },
      appliedNames: { useQuery: () => ({ data: [] }) },
    },
    useUtils: () => ({
      lead: { list: { invalidate: vi.fn(() => Promise.resolve()) } },
      savedFilters: { listByTarget: { invalidate: vi.fn(() => Promise.resolve()) } },
    }),
    savedFilters: { listByTarget: { useQuery: () => ({ data: [] }) } },
  },
}));
vi.mock("./AddLeadModal", () => ({ AddLeadModal: () => <div data-testid="add-lead-modal" /> }));
vi.mock("@/features/identity/preferencesActions", () => ({ setLeadsViewAction: vi.fn() }));
vi.mock("./leadServerActions", () => ({
  archiveLeadAction: vi.fn(),
  bulkUpdateLeadsAction: vi.fn(),
  bulkConvertLeadsAction: vi.fn(),
  convertLeadAction: vi.fn(),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { LeadsInbox } from "./LeadsInbox";

const REF_LABELS = { user: {}, person: {}, org: {} };

const LEAD = {
  id: "l1",
  title: "Acme lead",
  value: "1200.00",
  labels: [],
  sourceOrigin: "manually_created",
  personName: null,
  orgName: null,
  ownerName: "Nick",
  nextActivityAt: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
  archivedAt: null,
  updatedAt: new Date("2026-06-01T00:00:00Z"),
  convertedDealId: null,
  customFields: {},
};

function regionDef(over: Partial<CustomFieldDef> = {}): CustomFieldDef {
  return {
    id: "d1",
    targetEntity: "lead",
    type: "text",
    name: "Region",
    key: "region",
    options: [],
    isRequired: false,
    isImportant: false,
    showInAddForm: false,
    order: 0,
    archivedAt: null,
    ...over,
  };
}

function renderInbox(props: Partial<React.ComponentProps<typeof LeadsInbox>> = {}): void {
  render(<LeadsInbox {...props} />);
}

describe("LeadsInbox custom-field columns", () => {
  it("offers a custom field under Hidden and shows it as a column once toggled", async () => {
    const user = userEvent.setup();
    listQuery.mockReturnValue({ data: { rows: [LEAD], total: 1, refLabels: REF_LABELS }, refetch });
    renderInbox({ customFieldDefs: [regionDef()] });

    await user.click(screen.getByRole("button", { name: "Customize columns" }));
    expect(screen.getByText("Hidden")).not.toBeNull();
    await user.click(screen.getByRole("checkbox", { name: "Region" }));
    expect(screen.getByRole("columnheader", { name: /Region/ })).not.toBeNull();
  });

  it("renders the custom-field value in the row", () => {
    listQuery.mockReturnValue({
      data: {
        rows: [{ ...LEAD, customFields: { region: "West" } }],
        total: 1,
        refLabels: REF_LABELS,
      },
      refetch,
    });
    renderInbox({
      customFieldDefs: [regionDef()],
      initialView: { columns: ["title", "cf:region"], sort: { field: "createdAt", dir: "desc" } },
    });
    expect(screen.getByText("West")).not.toBeNull();
  });
});
