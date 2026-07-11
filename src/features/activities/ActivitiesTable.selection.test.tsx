// @vitest-environment jsdom
// Selection + bulk-action behavior extracted from ActivitiesTable.test.tsx to keep both files
// under the project's file-size budget: this file owns row/select-all checkboxes and the bulk
// action bar, while ActivitiesTable.test.tsx owns rendering and the edit modal, and
// ActivitiesTable.filters.test.tsx owns the filter toolbar's re-query wiring.
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/activities" }));

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
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

type ActionResult = { ok: true; value: { id: string } } | { ok: false; error: { id: string } };

const complete = vi.fn<(input: { id: string; done: boolean }) => Promise<ActionResult>>(() =>
  Promise.resolve({ ok: true, value: { id: "a1" } }),
);
const deleteActivity = vi.fn<(input: { id: string }) => Promise<ActionResult>>(() =>
  Promise.resolve({ ok: true, value: { id: "a1" } }),
);
vi.mock("./actions", () => ({
  completeActivityAction: (input: { id: string; done: boolean }) => complete(input),
  deleteActivityAction: (input: { id: string }) => deleteActivity(input),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "tok" }));

import { ActivitiesTable } from "./ActivitiesTable";

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

describe("ActivitiesTable selection and bulk actions", () => {
  it("does not open the edit modal when the row's checkbox is clicked", () => {
    useQuery.mockReturnValue({ data: [row({})], refetch });
    render(<ActivitiesTable />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Complete Call Jane" }));
    expect(screen.queryByTestId("edit-modal")).toBeNull();
  });

  it("does not open the edit modal when the row's select checkbox is clicked", () => {
    useQuery.mockReturnValue({ data: [row({})], refetch });
    render(<ActivitiesTable />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Call Jane" }));
    expect(screen.queryByTestId("edit-modal")).toBeNull();
  });

  it("selecting a row's checkbox (distinct from Done) reveals the bulk action bar", () => {
    useQuery.mockReturnValue({ data: [row({})], refetch });
    render(<ActivitiesTable />);
    // Done and Select are two independent checkboxes on the same row.
    expect(screen.getByRole("checkbox", { name: "Complete Call Jane" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Call Jane" }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Complete Call Jane" })).not.toBeChecked();
  });

  it("selecting all visible rows checks the header checkbox", () => {
    useQuery.mockReturnValue({
      data: [row({ id: "a1" }), row({ id: "a2", subject: "Call Bob" })],
      refetch,
    });
    render(<ActivitiesTable />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all activities" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select all activities" })).toBeChecked();
  });

  it("bulk Mark done calls completeActivityAction({ id, done: true }) for each selected row", async () => {
    useQuery.mockReturnValue({ data: [row({})], refetch });
    render(<ActivitiesTable />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Call Jane" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark done" }));
    await vi.waitFor(() => expect(complete).toHaveBeenCalledWith({ id: "a1", done: true }));
  });

  it("bulk Delete calls deleteActivityAction with the selected id, then clears selection", async () => {
    useQuery.mockReturnValue({ data: [row({})], refetch });
    render(<ActivitiesTable />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Call Jane" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await vi.waitFor(() => expect(deleteActivity).toHaveBeenCalledWith({ id: "a1" }));
    await vi.waitFor(() => expect(screen.queryByText(/selected/)).not.toBeInTheDocument());
  });

  it("keeps the failed row selected and surfaces an error on a partial bulk-delete failure", async () => {
    deleteActivity.mockImplementation((input: { id: string }) =>
      Promise.resolve(
        input.id === "a1"
          ? { ok: true, value: { id: "a1" } }
          : { ok: false, error: { id: "E_PERM_001" } },
      ),
    );
    useQuery.mockReturnValue({
      data: [row({ id: "a1" }), row({ id: "a2", subject: "Call Bob" })],
      refetch,
    });
    render(<ActivitiesTable />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all activities" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't delete|could not delete|failed/i);
    await vi.waitFor(() => expect(screen.getByText("1 selected")).toBeInTheDocument());
    expect(screen.getByRole("checkbox", { name: "Select Call Bob" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select Call Jane" })).not.toBeChecked();
  });
});
