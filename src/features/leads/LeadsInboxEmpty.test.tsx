// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@/components/shell/ActionErrorProvider", () => ({ useActionError: () => vi.fn() }));
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

import { STRINGS } from "@/constants/strings";
import { LeadsInbox } from "./LeadsInbox";

describe("LeadsInbox empty states", () => {
  // A header row, a select-all checkbox and sort controls over zero rows is machinery, not
  // information; and the empty state has to offer the action its own sentence names.
  it("drops the table chrome on an unfiltered empty inbox and offers Add lead", () => {
    listQuery.mockReturnValue({ data: { rows: [], total: 0 }, refetch });
    render(<LeadsInbox />);

    expect(screen.queryByRole("table")).toBeNull();
    const empty = screen.getByRole("status");
    expect(empty).toHaveTextContent(STRINGS.leads.emptyBody);
    fireEvent.click(within(empty).getByRole("button", { name: STRINGS.leads.emptyAction }));
    expect(screen.getByTestId("add-lead-modal")).toBeInTheDocument();
  });

  // An inbox with no leads at all can still have a filter on, and the inbox reads every count
  // through that filter, so it cannot prove leads exist. The sentence must not claim they do.
  it("claims no leads exist behind the filter on an empty inbox", () => {
    listQuery.mockReturnValue({ data: { rows: [], total: 0 }, refetch });
    render(<LeadsInbox />);

    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.click(screen.getByRole("button", { name: /add condition/i }));
    fireEvent.change(screen.getByLabelText("Condition 1 value"), { target: { value: "zzz" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    const empty = screen.getByRole("status");
    expect(empty).toHaveTextContent(STRINGS.leads.emptyFilteredTitle);
    expect(empty).not.toHaveTextContent(/still (here|holds)|does have|every lead is/i);
  });

  it("names the archive, not an empty database, on the empty Archive view", () => {
    listQuery.mockReturnValue({ data: { rows: [], total: 0 }, refetch });
    render(<LeadsInbox />);

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(screen.getByRole("status")).toHaveTextContent(STRINGS.leads.emptyArchivedTitle);
  });

  it("keeps the table and its chrome once there is a row to show", () => {
    listQuery.mockReturnValue({
      data: {
        rows: [
          {
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
          },
        ],
        total: 1,
      },
      refetch,
    });
    render(<LeadsInbox />);

    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});
