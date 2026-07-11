// @vitest-environment jsdom
// Filter-toolbar wiring extracted from ActivitiesTable.test.tsx to keep both files under the
// project's file-size budget: this file owns "does a toolbar interaction re-query listRows with
// the right ActivityListFilter", while ActivitiesTable.test.tsx owns rendering, the edit modal,
// and ActivitiesTable.selection.test.tsx owns selection/bulk actions.
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/activities" }));

beforeAll(() => {
  // Radix Select + the Combobox/DatePicker popovers (ActivitiesFilters) need these in jsdom.
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
      listTypes: {
        useQuery: () => ({
          data: [
            { id: "t1", key: "call", name: "Call" },
            { id: "t2", key: "meeting", name: "Meeting" },
          ],
        }),
      },
    },
    identity: {
      assignableUsers: {
        useQuery: () => ({ data: [{ id: "u1", name: "Ann Owner", avatarUrl: null }] }),
      },
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

describe("ActivitiesTable filter toolbar", () => {
  it("clicking a type tab re-queries listRows with the chosen typeKey", () => {
    useQuery.mockReturnValue({ data: [row({})], refetch });
    render(<ActivitiesTable />);
    fireEvent.click(screen.getByRole("button", { name: "Meeting" }));
    expect(useQuery).toHaveBeenLastCalledWith(expect.objectContaining({ typeKey: "meeting" }));
  });

  it("clicking the All tab resets typeKey to null", () => {
    useQuery.mockReturnValue({ data: [row({})], refetch });
    render(<ActivitiesTable />);
    fireEvent.click(screen.getByRole("button", { name: "Meeting" }));
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(useQuery).toHaveBeenLastCalledWith(expect.objectContaining({ typeKey: null }));
  });

  it("choosing an owner re-queries listRows with the chosen ownerId", () => {
    useQuery.mockReturnValue({ data: [row({})], refetch });
    render(<ActivitiesTable />);
    fireEvent.click(screen.getByLabelText("Owner"));
    fireEvent.click(screen.getByText("Ann Owner"));
    expect(useQuery).toHaveBeenLastCalledWith(expect.objectContaining({ ownerId: "u1" }));
  });

  it("changing the Status select re-queries listRows with the new done value", () => {
    useQuery.mockReturnValue({ data: [row({})], refetch });
    render(<ActivitiesTable />);
    fireEvent.click(screen.getByLabelText("Status"));
    fireEvent.click(screen.getByRole("option", { name: "Completed" }));
    expect(useQuery).toHaveBeenLastCalledWith(expect.objectContaining({ done: "done" }));
  });

  it("picking a From date re-queries listRows with the new from value", () => {
    useQuery.mockReturnValue({ data: [row({})], refetch });
    render(<ActivitiesTable />);
    fireEvent.click(screen.getByLabelText("From"));
    fireEvent.click(screen.getByText("15"));
    expect(useQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ from: expect.any(String) }),
    );
  });
});
