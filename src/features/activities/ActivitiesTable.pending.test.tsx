// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
vi.mock("@/components/shell/ActionErrorProvider", () => ({ useActionError: () => vi.fn() }));

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

function hold(): { resolve: () => void } {
  let resolve: () => void = () => undefined;
  complete.mockImplementation(
    () =>
      new Promise<ActionResult>((r) => {
        resolve = () => r({ ok: true, value: { id: "a1" } });
      }),
  );
  return {
    resolve: () => resolve(),
  };
}

describe("ActivitiesTable pending states", () => {
  it("disables the bulk actions and shows progress while Mark done runs", async () => {
    const run = hold();
    useQuery.mockReturnValue({ data: [ROW], refetch });
    render(<ActivitiesTable currentUserId="me" />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Call Jane" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark done" }));

    const busy = screen.getByRole("button", { name: "Marking done 0/1..." });
    expect(busy).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    fireEvent.click(busy);
    expect(complete).toHaveBeenCalledTimes(1);

    await act(async () => {
      run.resolve();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(screen.queryByText(/Marking done/)).not.toBeInTheDocument());
  });

  it("disables a row's Done toggle until its completion settles", async () => {
    const run = hold();
    useQuery.mockReturnValue({ data: [ROW], refetch });
    render(<ActivitiesTable currentUserId="me" />);
    const done = screen.getByRole("checkbox", { name: "Complete Call Jane" });
    fireEvent.click(done);
    expect(done).toBeDisabled();
    fireEvent.click(done);
    expect(complete).toHaveBeenCalledTimes(1);

    await act(async () => {
      run.resolve();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(done).not.toBeDisabled());
  });
});
