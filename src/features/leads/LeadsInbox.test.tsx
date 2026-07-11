// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  // Radix DropdownMenu (the per-row actions menu) needs these in jsdom.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// The shared app-wide error reporter (mounted in the (app) shell). Mocked so a mutation's
// else-branch report is observable without rendering the provider.
const reportError = vi.fn();
vi.mock("@/components/shell/ActionErrorProvider", () => ({
  useActionError: () => reportError,
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
    // Ungated: every user gets the full active-user list so owner filtering runs server-side.
    identity: { assignableUsers: { useQuery: () => ({ data: [] }) } },
    labels: {
      listByTarget: {
        useQuery: () => ({
          data: [{ id: "l1", target: "lead", name: "Hot", color: "red", order: 0 }],
        }),
      },
    },
    useUtils: () => ({ lead: { list: { invalidate: vi.fn(() => Promise.resolve()) } } }),
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

const LEAD = {
  id: "l1",
  title: "Acme lead",
  value: "1200.00",
  labels: ["Hot"],
  sourceOrigin: "manually_created",
  personName: "Jane Roe",
  orgName: "Acme Inc",
  ownerName: "Nick",
  nextActivityAt: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
  archivedAt: null,
  updatedAt: new Date("2026-06-01T00:00:00Z"),
  convertedDealId: null,
};

describe("LeadsInbox", () => {
  it("renders the default table columns and a lead row with its label chip", () => {
    listQuery.mockReturnValue({ data: { rows: [LEAD], total: 1 }, refetch });
    render(<LeadsInbox />);
    // Scope header assertions to the table (some labels, e.g. "Next activity", also name a filter).
    const table = within(screen.getByRole("table"));
    for (const col of [
      "Title",
      "Next activity",
      "Labels",
      "Source origin",
      "Lead created",
      "Owner",
    ]) {
      expect(table.getByText(col)).toBeInTheDocument();
    }
    expect(screen.getByText("Acme lead")).toBeInTheDocument();
    expect(screen.getAllByText("Hot").some((el) => el.tagName === "SPAN")).toBe(true);
    // Inbox/Archive toggle moved into the action-bar icon group.
    expect(screen.getByRole("button", { name: "Inbox" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
  });

  it("shows an empty state when there are no leads", () => {
    listQuery.mockReturnValue({ data: { rows: [], total: 0 }, refetch });
    render(<LeadsInbox />);
    expect(screen.getByText(/No leads yet/i)).toBeInTheDocument();
  });

  it("opens the Add lead modal from the + Lead button", () => {
    listQuery.mockReturnValue({ data: { rows: [], total: 0 }, refetch });
    render(<LeadsInbox />);
    fireEvent.click(screen.getByRole("button", { name: "+ Lead" }));
    expect(screen.getByTestId("add-lead-modal")).toBeInTheDocument();
  });

  it("shows the server total in the header count, not just the loaded page size", () => {
    // rows is capped at the page limit; the header must reflect the full server total.
    listQuery.mockReturnValue({ data: { rows: [LEAD], total: 250 }, refetch });
    render(<LeadsInbox />);
    expect(screen.getByText("250 leads")).toBeInTheDocument();
  });

  it("loads the next page, appends rows, and hides Load more once all are loaded", async () => {
    const page1 = [
      { ...LEAD, id: "a0", title: "Lead A0" },
      { ...LEAD, id: "a1", title: "Lead A1" },
    ];
    const page2 = [{ ...LEAD, id: "b0", title: "Lead B0" }];
    listQuery.mockImplementation((input: { offset: number }) =>
      input.offset === 0
        ? { data: { rows: page1, total: 3 }, refetch }
        : { data: { rows: page2, total: 3 }, refetch },
    );
    render(<LeadsInbox />);
    expect(screen.getByText("Lead A0")).toBeInTheDocument();
    expect(screen.queryByText("Lead B0")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    // Second page is appended (first-page rows remain visible).
    expect(await screen.findByText("Lead B0")).toBeInTheDocument();
    expect(screen.getByText("Lead A0")).toBeInTheDocument();
    // All 3 of 3 loaded: the affordance disappears.
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });

  it("reveals the bulk-edit panel after selecting a row", () => {
    listQuery.mockReturnValue({ data: { rows: [LEAD], total: 1 }, refetch });
    render(<LeadsInbox />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Acme lead" }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("converts the selection via the bulk bar's Convert to deal button", async () => {
    const { bulkConvertLeadsAction } = await import("./leadServerActions");
    vi.mocked(bulkConvertLeadsAction).mockResolvedValue({
      ok: true,
      value: { converted: 1, skipped: 0 },
    });
    listQuery.mockReturnValue({ data: { rows: [LEAD], total: 1 }, refetch });
    render(<LeadsInbox />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Acme lead" }));
    fireEvent.click(screen.getByRole("button", { name: "Convert to deal" }));
    await waitFor(() => {
      expect(bulkConvertLeadsAction).toHaveBeenCalledWith({ ids: ["l1"] }, "csrf");
    });
  });

  it("surfaces a systemic bulk-convert failure and does not clear the selection or refetch", async () => {
    const { bulkConvertLeadsAction } = await import("./leadServerActions");
    vi.mocked(bulkConvertLeadsAction).mockResolvedValue({
      ok: false,
      error: { id: "E_PERM_001" },
    });
    listQuery.mockReturnValue({ data: { rows: [LEAD], total: 1 }, refetch });
    render(<LeadsInbox />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Acme lead" }));
    fireEvent.click(screen.getByRole("button", { name: "Convert to deal" }));

    await waitFor(() => {
      expect(bulkConvertLeadsAction).toHaveBeenCalledTimes(1);
    });
    // A total failure must read as an error, not a silent no-op: the selection stays and the
    // list is not refetched as if the batch had succeeded.
    expect(await screen.findByRole("alert")).toHaveTextContent(/permission/i);
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(refetch).not.toHaveBeenCalled();
  });

  it("surfaces a failed bulk change (delete) through the shared error reporter", async () => {
    const { bulkUpdateLeadsAction } = await import("./leadServerActions");
    vi.mocked(bulkUpdateLeadsAction).mockResolvedValue({
      ok: false,
      error: { id: "E_PERM_001" },
    });
    listQuery.mockReturnValue({ data: { rows: [LEAD], total: 1 }, refetch });
    render(<LeadsInbox />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Acme lead" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(bulkUpdateLeadsAction).toHaveBeenCalledTimes(1);
    });
    // A permission/session failure must not be a silent no-op.
    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
    expect(refetch).not.toHaveBeenCalled();
  });

  it("surfaces a failed row archive toggle through the shared error reporter", async () => {
    const user = userEvent.setup();
    const { archiveLeadAction } = await import("./leadServerActions");
    vi.mocked(archiveLeadAction).mockResolvedValue({ ok: false, error: { id: "E_PERM_001" } });
    listQuery.mockReturnValue({ data: { rows: [LEAD], total: 1 }, refetch });
    render(<LeadsInbox />);

    await user.click(screen.getByRole("button", { name: "Lead actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive" }));

    await waitFor(() => {
      expect(archiveLeadAction).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
    expect(refetch).not.toHaveBeenCalled();
  });

  it("guards the bulk Convert to deal button against a rapid double-click", async () => {
    const { bulkConvertLeadsAction } = await import("./leadServerActions");
    let resolveAction: (v: { ok: true; value: { converted: number; skipped: number } }) => void =
      () => {};
    vi.mocked(bulkConvertLeadsAction).mockReturnValue(
      new Promise((resolve) => {
        resolveAction = resolve;
      }),
    );
    listQuery.mockReturnValue({ data: { rows: [LEAD], total: 1 }, refetch });
    render(<LeadsInbox />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Acme lead" }));
    const button = screen.getByRole("button", { name: "Convert to deal" });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => {
      expect(bulkConvertLeadsAction).toHaveBeenCalledTimes(1);
    });
    resolveAction({ ok: true, value: { converted: 1, skipped: 0 } });
  });
});
