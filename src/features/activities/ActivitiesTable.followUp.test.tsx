// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  INTERFACE_PREFS_DEFAULT,
  InterfacePrefsProvider,
} from "@/features/identity/InterfacePrefsProvider";

vi.mock("next/navigation", () => ({
  usePathname: () => "/activities",
  useRouter: () => ({ push: vi.fn() }),
}));

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

const refetch = vi.fn(() => Promise.resolve());
const useQuery = vi.fn();
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    useUtils: () => ({
      activities: {
        dayLoad: { invalidate: () => Promise.resolve() },
        listRows: { invalidate: () => Promise.resolve() },
      },
    }),
    activities: {
      listRows: { useQuery: (input?: unknown) => useQuery(input) },
      listTypes: { useQuery: () => ({ data: [{ id: "t1", key: "call", name: "Call" }] }) },
    },
    identity: { assignableUsers: { useQuery: () => ({ data: [] }) } },
  },
}));
vi.mock("./AddActivityModal", () => ({
  AddActivityModal: ({
    dealId,
    leadId,
    defaultPersonId,
    defaultOrgId,
    onClose,
  }: {
    dealId?: string | null;
    leadId?: string | null;
    defaultPersonId?: string | null;
    defaultOrgId?: string | null;
    onClose: () => void;
  }) => (
    <div data-testid="add-modal">
      <span data-testid="add-modal-links">
        {[dealId, leadId, defaultPersonId, defaultOrgId].map((v) => v ?? "-").join(",")}
      </span>
      <button type="button" onClick={onClose}>
        Close add
      </button>
    </div>
  ),
}));
vi.mock("./ActivityEditModal", () => ({
  ActivityEditModal: ({
    activity,
    onClose,
    onMarkedDone,
  }: {
    activity: { id: string };
    onClose: () => void;
    onMarkedDone?: (id: string) => void;
  }) => (
    <div data-testid="edit-modal">
      <span data-testid="edit-modal-id">{activity.id}</span>
      <button type="button" onClick={() => onMarkedDone?.(activity.id)}>
        Mark as done
      </button>
      <button type="button" onClick={() => onMarkedDone?.("stale-id")}>
        Stale done
      </button>
      <button type="button" onClick={onClose}>
        Close edit
      </button>
    </div>
  ),
}));

type ActionResult = { ok: true; value: { id: string } } | { ok: false; error: { id: string } };
const complete = vi.fn<(input: { id: string; done: boolean }) => Promise<ActionResult>>();
vi.mock("./actions", () => ({
  completeActivityAction: (input: { id: string; done: boolean }) => complete(input),
  deleteActivityAction: () => Promise.resolve({ ok: true, value: { id: "a1" } }),
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "tok" }));

const reportError = vi.fn();
vi.mock("@/components/shell/ActionErrorProvider", () => ({
  useActionError: () => reportError,
}));

import { ActivitiesTable } from "./ActivitiesTable";
import { FollowUpPromptProvider } from "./followUpAfterDone";

const ROW = {
  id: "a1",
  subject: "Call Jane",
  typeKey: "call",
  priority: null,
  done: false,
  dueAtIso: null,
  allDay: false,
  dealId: "d1",
  dealTitle: "Acme",
  leadId: null,
  leadTitle: null,
  personId: "p1",
  personName: "Jane",
  personEmail: null,
  personPhone: null,
  orgId: "o1",
  orgName: "Acme Inc",
  location: null,
  durationMinutes: null,
  assigneeId: "u1",
  assigneeName: "",
  ownerName: "",
};

function renderTable(enabled: boolean): void {
  render(
    <InterfacePrefsProvider
      value={{ ...INTERFACE_PREFS_DEFAULT, scheduleFollowUpAfterDone: enabled }}
    >
      <FollowUpPromptProvider>
        <ActivitiesTable />
      </FollowUpPromptProvider>
    </InterfacePrefsProvider>,
  );
}

describe("ActivitiesTable follow-up prompt after mark-done", () => {
  it("opens the add modal linked to the row's records after a successful mark-done", async () => {
    complete.mockResolvedValue({ ok: true, value: { id: "a1" } });
    useQuery.mockReturnValue({ data: [ROW], refetch });
    renderTable(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Complete Call Jane" }));
    expect(await screen.findByTestId("add-modal")).toBeInTheDocument();
    expect(screen.getByTestId("add-modal-links")).toHaveTextContent("d1,-,p1,o1");
    fireEvent.click(screen.getByRole("button", { name: "Close add" }));
    expect(screen.queryByTestId("add-modal")).toBeNull();
  });

  it("does not prompt when the preference is off", async () => {
    complete.mockResolvedValue({ ok: true, value: { id: "a1" } });
    useQuery.mockReturnValue({ data: [ROW], refetch });
    renderTable(false);
    fireEvent.click(screen.getByRole("checkbox", { name: "Complete Call Jane" }));
    await waitFor(() => expect(refetch).toHaveBeenCalled());
    expect(screen.queryByTestId("add-modal")).toBeNull();
  });

  it("does not prompt when reopening or when the mark-done fails", async () => {
    complete.mockResolvedValue({ ok: false, error: { id: "E_AUTH_CSRF" } });
    useQuery.mockReturnValue({ data: [ROW], refetch });
    renderTable(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Complete Call Jane" }));
    await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_AUTH_CSRF"));
    expect(screen.queryByTestId("add-modal")).toBeNull();
    cleanup();

    complete.mockResolvedValue({ ok: true, value: { id: "a1" } });
    useQuery.mockReturnValue({ data: [{ ...ROW, done: true }], refetch });
    renderTable(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Complete Call Jane" }));
    await waitFor(() => expect(complete).toHaveBeenCalledWith({ id: "a1", done: false }));
    expect(screen.queryByTestId("add-modal")).toBeNull();
  });

  it("marking done from the edit modal closes it and opens the follow-up prompt", async () => {
    useQuery.mockReturnValue({
      data: [{ ...ROW, dealId: null, personId: null, orgId: null }],
      refetch,
    });
    renderTable(true);
    fireEvent.click(screen.getByText("Call Jane"));
    expect(await screen.findByTestId("edit-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark as done" }));
    expect(screen.queryByTestId("edit-modal")).toBeNull();
    expect(screen.getByTestId("add-modal-links")).toHaveTextContent("-,-,-,-");
  });

  it("a stale mark-done callback for another activity does not close the open editor", async () => {
    useQuery.mockReturnValue({
      data: [{ ...ROW, dealId: null, personId: null, orgId: null }],
      refetch,
    });
    renderTable(true);
    fireEvent.click(screen.getByText("Call Jane"));
    expect(await screen.findByTestId("edit-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stale done" }));
    expect(screen.getByTestId("edit-modal-id")).toHaveTextContent("a1");
    expect(screen.queryByTestId("add-modal")).toBeNull();
  });

  it("marking done from the edit modal leaves it open when the preference is off", async () => {
    useQuery.mockReturnValue({
      data: [{ ...ROW, dealId: null, personId: null, orgId: null }],
      refetch,
    });
    renderTable(false);
    fireEvent.click(screen.getByText("Call Jane"));
    expect(await screen.findByTestId("edit-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark as done" }));
    expect(screen.getByTestId("edit-modal")).toBeInTheDocument();
    expect(screen.queryByTestId("add-modal")).toBeNull();
  });
});
