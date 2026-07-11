// @vitest-environment jsdom
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
  ActivityEditModal: ({
    activity,
    onClose,
  }: {
    activity: { id: string; typeId: string };
    onClose: () => void;
  }) => (
    <div data-testid="edit-modal">
      <span data-testid="edit-modal-id">{activity.id}</span>
      <span data-testid="edit-modal-type">{activity.typeId}</span>
      <button type="button" onClick={onClose}>
        Close edit
      </button>
    </div>
  ),
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

describe("ActivitiesTable", () => {
  it("renders all Pipedrive columns and the type tab strip driven by listTypes", () => {
    useQuery.mockReturnValue({ data: [row({})], refetch });
    render(<ActivitiesTable />);
    for (const h of [
      "Done",
      "Subject",
      "Deal",
      "Priority",
      "Contact",
      "Email",
      "Phone",
      "Organization",
      "Due",
      "Duration",
      "Assignee",
    ]) {
      expect(screen.getByText(h)).toBeInTheDocument();
    }
    // Type tabs come from listTypes (custom + system types), not a hardcoded list.
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Call" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Meeting" })).toBeInTheDocument();
    // The filter toolbar (owner, status, date range) is present.
    expect(screen.getByLabelText("Owner")).toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toBeInTheDocument();
    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toBeInTheDocument();
    // Enriched cells.
    expect(screen.getByText("jane@acme.com")).toBeInTheDocument();
    expect(screen.getByText("+14155550100")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it("renders the row's duration and assignee (not the creator/owner)", () => {
    useQuery.mockReturnValue({
      data: [row({ durationMinutes: 45, assigneeName: "Jane Doe", ownerName: "Someone Else" })],
      refetch,
    });
    render(<ActivitiesTable />);
    expect(screen.getByText("45 min")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.queryByText("Someone Else")).toBeNull();
  });

  it("renders no duration text when durationMinutes is null", () => {
    useQuery.mockReturnValue({ data: [row({ durationMinutes: null })], refetch });
    render(<ActivitiesTable />);
    expect(screen.queryByText(/min/)).toBeNull();
  });

  it("flags an open past-due row as overdue", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    useQuery.mockReturnValue({
      data: [row({ done: false, dueAtIso: yesterday })],
      refetch,
    });
    render(<ActivitiesTable />);
    expect(screen.getByText("Call Jane").closest("tr")).toHaveClass("text-destructive");
  });

  it("does not flag a done row as overdue, even with a past due date", () => {
    useQuery.mockReturnValue({
      data: [row({ done: true, dueAtIso: new Date(Date.now() - 1000).toISOString() })],
      refetch,
    });
    render(<ActivitiesTable />);
    expect(screen.getByText("Call Jane").closest("tr")).not.toHaveClass("text-destructive");
  });

  it("shows an error state with a Retry (not the empty state) when the query fails", () => {
    // A transient batched-401 leaves rowsQ.data undefined AND isError=true. The table must not
    // paint that as "No activities in this view." (indistinguishable from a genuinely empty list),
    // and must offer a way to recover. Regression guard for ACTIVITIES-01 / the F5-1 class.
    useQuery.mockReturnValue({
      data: undefined,
      isError: true,
      error: { message: "E_AUTH_003" },
      refetch,
    });
    render(<ActivitiesTable />);
    expect(screen.queryByText("No activities in this view.")).toBeNull();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: /retry/i });
    fireEvent.click(retry);
    expect(refetch).toHaveBeenCalled();
  });

  it("does not show the empty state while the first load is still pending", () => {
    useQuery.mockReturnValue({ data: undefined, isPending: true, refetch });
    render(<ActivitiesTable />);
    expect(screen.queryByText("No activities in this view.")).toBeNull();
  });

  it("opens the Add activity modal from + Activity", () => {
    useQuery.mockReturnValue({ data: [], refetch });
    render(<ActivitiesTable />);
    fireEvent.click(screen.getByRole("button", { name: "+ Activity" }));
    expect(screen.getByTestId("activity-modal")).toBeInTheDocument();
  });

  it("reopens a completed activity when its checkbox is toggled", () => {
    useQuery.mockReturnValue({
      data: [row({ done: true, dueAtIso: new Date().toISOString() })],
      refetch,
    });
    render(<ActivitiesTable />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Complete Call Jane" }));
    expect(complete).toHaveBeenCalledWith({ id: "a1", done: false });
  });

  it("opens the edit modal on row click, mapping typeKey to the matching listTypes id", () => {
    useQuery.mockReturnValue({ data: [row({ typeKey: "call" })], refetch });
    render(<ActivitiesTable />);
    expect(screen.queryByTestId("edit-modal")).toBeNull();
    fireEvent.click(screen.getByText("Call Jane"));
    expect(screen.getByTestId("edit-modal-id")).toHaveTextContent("a1");
    expect(screen.getByTestId("edit-modal-type")).toHaveTextContent("t1");
    fireEvent.click(screen.getByRole("button", { name: "Close edit" }));
    expect(screen.queryByTestId("edit-modal")).toBeNull();
  });

  it("does not open the edit modal when the row's checkbox is clicked", () => {
    useQuery.mockReturnValue({ data: [row({})], refetch });
    render(<ActivitiesTable />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Complete Call Jane" }));
    expect(screen.queryByTestId("edit-modal")).toBeNull();
  });

  it("links the person/org cells and mailto/tel-links the email/phone cells", () => {
    useQuery.mockReturnValue({
      data: [row({ orgId: "o1", orgName: "Acme Inc" })],
      refetch,
    });
    render(<ActivitiesTable />);
    expect(screen.getByRole("link", { name: "Jane Roe" })).toHaveAttribute(
      "href",
      "/contacts/people/pe1",
    );
    expect(screen.getByRole("link", { name: "Acme Inc" })).toHaveAttribute(
      "href",
      "/contacts/orgs/o1",
    );
    expect(screen.getByRole("link", { name: "jane@acme.com" })).toHaveAttribute(
      "href",
      "mailto:jane@acme.com",
    );
    expect(screen.getByRole("link", { name: "+14155550100" })).toHaveAttribute(
      "href",
      "tel:+14155550100",
    );
  });

  it("renders a dash for person/org/email/phone when the row has none", () => {
    useQuery.mockReturnValue({
      data: [
        row({
          personId: null,
          personName: null,
          personEmail: null,
          personPhone: null,
          orgId: null,
          orgName: null,
        }),
      ],
      refetch,
    });
    render(<ActivitiesTable />);
    expect(screen.queryByRole("link", { name: /Jane|Acme/ })).toBeNull();
  });

  it("does not open the edit modal when a person/org/email/phone link is clicked", () => {
    useQuery.mockReturnValue({
      data: [row({ orgId: "o1", orgName: "Acme Inc" })],
      refetch,
    });
    render(<ActivitiesTable />);
    fireEvent.click(screen.getByRole("link", { name: "Jane Roe" }));
    expect(screen.queryByTestId("edit-modal")).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Acme Inc" }));
    expect(screen.queryByTestId("edit-modal")).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "jane@acme.com" }));
    expect(screen.queryByTestId("edit-modal")).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "+14155550100" }));
    expect(screen.queryByTestId("edit-modal")).toBeNull();
  });
});
