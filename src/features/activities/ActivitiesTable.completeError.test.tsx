// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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
vi.mock("./AddActivityModal", () => ({ AddActivityModal: () => null }));
vi.mock("./ActivityEditModal", () => ({ ActivityEditModal: () => null }));

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

const ROW = {
  id: "a1",
  subject: "Call Jane",
  typeKey: "call",
  priority: null,
  done: false,
  dueAtIso: null,
  allDay: false,
  dealId: null,
  dealTitle: null,
  personId: null,
  personName: null,
  personEmail: null,
  personPhone: null,
  orgId: null,
  orgName: null,
  location: null,
  durationMinutes: null,
  assigneeId: "u1",
  assigneeName: "",
  ownerName: "",
};

describe("ActivitiesTable done checkbox failure", () => {
  // Regression: a rejected complete (E_AUTH_CSRF, a permission denial, a dead session) used to be
  // dropped on the floor. The checkbox stayed unchecked and the user had no way to know the click
  // never reached the database, which is how prod accumulated 74 activities and zero completions.
  it("reports the error id when marking done fails", async () => {
    complete.mockResolvedValue({ ok: false, error: { id: "E_AUTH_CSRF" } });
    useQuery.mockReturnValue({ data: [ROW], refetch });
    render(<ActivitiesTable />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Complete Call Jane" }));

    await waitFor(() => {
      expect(reportError).toHaveBeenCalledWith("E_AUTH_CSRF");
    });
  });

  it("does not report anything when marking done succeeds", async () => {
    complete.mockResolvedValue({ ok: true, value: { id: "a1" } });
    useQuery.mockReturnValue({ data: [ROW], refetch });
    render(<ActivitiesTable />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Complete Call Jane" }));

    await waitFor(() => {
      expect(refetch).toHaveBeenCalled();
    });
    expect(reportError).not.toHaveBeenCalled();
  });
});
