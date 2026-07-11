// @vitest-environment jsdom
// Sort-header behavior extracted from ActivitiesTable.test.tsx to keep both files under the
// project's file-size budget: this file owns the header-click-to-sort contract (which server
// sort field/direction each header click requests) and the day-grouping reconciliation (day
// headers only make sense for a date-ordered list), while ActivitiesTable.test.tsx owns
// rendering, ActivitiesTable.filters.test.tsx owns the filter toolbar, and
// ActivitiesTable.selection.test.tsx owns selection and bulk actions.
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/activities" }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const refetch = vi.fn();
const useQuery = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    activities: {
      listRows: { useQuery: (input?: unknown) => useQuery(input) },
      listTypes: { useQuery: () => ({ data: [{ id: "t1", key: "call", name: "Call" }] }) },
    },
    identity: {
      assignableUsers: { useQuery: () => ({ data: [] }) },
    },
  },
}));
vi.mock("./AddActivityModal", () => ({
  AddActivityModal: () => <div data-testid="activity-modal" />,
}));
vi.mock("./ActivityEditModal", () => ({
  ActivityEditModal: () => <div data-testid="edit-modal" />,
}));
vi.mock("./actions", () => ({
  completeActivityAction: vi.fn(() => Promise.resolve({ ok: true, value: { id: "a1" } })),
  deleteActivityAction: vi.fn(() => Promise.resolve({ ok: true, value: { id: "a1" } })),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "tok" }));

import { ActivitiesTable } from "./ActivitiesTable";

// The default (unfiltered, "open") ActivityListFilter, unchanged by these tests: only the sort
// field/direction varies per assertion below.
const DEFAULT_FILTER = { ownerId: null, done: "open", from: null, to: null, typeKey: null };

function row(overrides: Record<string, unknown>) {
  return {
    id: "a1",
    subject: "Call Jane",
    typeKey: "call",
    priority: "high",
    done: false,
    dueAtIso: null,
    dealId: null,
    dealTitle: null,
    personId: "pe1",
    personName: "Jane Roe",
    personEmail: "jane@acme.com",
    personPhone: "+14155550100",
    orgId: null,
    orgName: "Acme Inc",
    durationMinutes: null,
    assigneeId: "u1",
    assigneeName: "",
    ownerName: "",
    ...overrides,
  };
}

describe("ActivitiesTable sort headers", () => {
  it("clicking the Subject header re-queries listRows with the new sort", () => {
    useQuery.mockReturnValue({ data: [row({})], refetch });
    render(<ActivitiesTable />);
    fireEvent.click(screen.getByRole("button", { name: "Subject" }));
    expect(useQuery).toHaveBeenLastCalledWith({
      ...DEFAULT_FILTER,
      sort: { field: "subject", dir: "asc" },
    });
  });

  it("clicking the Duration header re-queries listRows with the new sort", () => {
    useQuery.mockReturnValue({ data: [row({})], refetch });
    render(<ActivitiesTable />);
    fireEvent.click(screen.getByRole("button", { name: "Duration" }));
    expect(useQuery).toHaveBeenLastCalledWith({
      ...DEFAULT_FILTER,
      sort: { field: "duration", dir: "asc" },
    });
  });

  it("cycles the Duration header asc to desc to the default sort on repeated clicks", () => {
    useQuery.mockReturnValue({ data: [row({})], refetch });
    render(<ActivitiesTable />);
    const header = screen.getByRole("button", { name: "Duration" });
    fireEvent.click(header);
    expect(useQuery).toHaveBeenLastCalledWith({
      ...DEFAULT_FILTER,
      sort: { field: "duration", dir: "asc" },
    });
    fireEvent.click(header);
    expect(useQuery).toHaveBeenLastCalledWith({
      ...DEFAULT_FILTER,
      sort: { field: "duration", dir: "desc" },
    });
    fireEvent.click(header);
    expect(useQuery).toHaveBeenLastCalledWith({
      ...DEFAULT_FILTER,
      sort: { field: "dueAtIso", dir: "asc" },
    });
  });
});

describe("ActivitiesTable day-grouping reconciliation", () => {
  it("groups rows under day headers when the default (date) sort is active", () => {
    useQuery.mockReturnValue({
      data: [
        row({ id: "a1", subject: "Call Jane", dueAtIso: "2026-07-04T09:00:00.000Z" }),
        row({ id: "a2", subject: "Call Bob", dueAtIso: "2026-07-05T09:00:00.000Z" }),
      ],
      refetch,
    });
    render(<ActivitiesTable />);
    expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
  });

  it("suppresses day-grouping (flat list) when a non-date sort, e.g. Duration, is active", () => {
    useQuery.mockReturnValue({
      data: [
        row({ id: "a1", subject: "Call Jane", dueAtIso: "2026-07-04T09:00:00.000Z" }),
        row({ id: "a2", subject: "Call Bob", dueAtIso: "2026-07-05T09:00:00.000Z" }),
      ],
      refetch,
    });
    render(<ActivitiesTable />);
    fireEvent.click(screen.getByRole("button", { name: "Duration" }));
    expect(screen.queryAllByRole("heading")).toHaveLength(0);
    expect(screen.getByText("Call Jane")).toBeInTheDocument();
    expect(screen.getByText("Call Bob")).toBeInTheDocument();
  });
});
