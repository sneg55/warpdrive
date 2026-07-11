// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  // The Lost dialog's reason picker (Combobox) uses cmdk, which observes its list size.
  global.ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
});

const markWonAction = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "d1" } })),
);
const markLostAction = vi.hoisted(() =>
  vi.fn((input: { dealId: string; lostReasonId?: string | null; lostReason?: string | null }) =>
    Promise.resolve({ ok: true as const, value: { id: input.dealId } }),
  ),
);
const reopenDealAction = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "d1" } })),
);
vi.mock("./actions", () => ({
  markWonAction,
  markLostAction,
  reopenDealAction,
}));
const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: routerRefresh }) }));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));
const reportError = vi.fn();
vi.mock("@/features/deal-workspace/DealActionErrorProvider", () => ({
  useDealActionError: () => reportError,
}));

// The Won follow-up prompt reuses AddActivityModal for real (not mocked), so its own
// server-action and tRPC dependencies need the same stubs as AddActivityModal.test.tsx.
const createActivityAction = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "a1" } })),
);
vi.mock("@/features/activities/actions", () => ({ createActivityAction }));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    activities: { listTypes: { useQuery: () => ({ data: [] }) } },
    contacts: {
      listPeople: { useQuery: () => ({ data: { rows: [], total: 0 } }) },
      listOrgs: { useQuery: () => ({ data: { rows: [], total: 0 } }) },
    },
  },
}));

const playWinChime = vi.hoisted(() => vi.fn());
vi.mock("@/features/deals/winChime", () => ({ playWinChime }));

import {
  INTERFACE_PREFS_DEFAULT,
  InterfacePrefsProvider,
} from "@/features/identity/InterfacePrefsProvider";
import { DealCloseActions } from "./DealCloseActions";

function withWinSound(node: React.ReactNode, winSound: boolean): React.ReactNode {
  return (
    <InterfacePrefsProvider value={{ ...INTERFACE_PREFS_DEFAULT, winSound }}>
      {node}
    </InterfacePrefsProvider>
  );
}

afterEach(() => {
  playWinChime.mockClear();
  cleanup();
  markWonAction.mockClear();
  markLostAction.mockClear();
  reopenDealAction.mockClear();
  createActivityAction.mockClear();
  routerRefresh.mockClear();
  reportError.mockClear();
});

const props = {
  dealId: "d1",
  status: "open",
  lostReasonOptions: [{ id: "r1", name: "Budget" }],
  scheduleFollowUpAfterWon: false,
};

it("primary Won marks the deal won", () => {
  render(<DealCloseActions {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Won" }));
  expect(markWonAction).toHaveBeenCalledTimes(1);
});

it("has no Won options dropdown: Won is a single plain button", () => {
  render(<DealCloseActions {...props} />);
  expect(screen.getByRole("button", { name: "Won" })).toBeInTheDocument();
  // The redundant split-button chevron / "Mark as won" menu item is gone.
  expect(screen.queryByRole("button", { name: "Won options" })).toBeNull();
  expect(screen.queryByRole("menuitem", { name: "Mark as won" })).toBeNull();
});

it("shows the status pill when the deal is already closed", () => {
  render(<DealCloseActions {...props} status="won" />);
  expect(screen.getByText("won")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Won options" })).toBeNull();
});

it("opens a centered Mark as Lost dialog and submits a free-text comment when no presets exist", async () => {
  render(
    <DealCloseActions
      dealId="d1"
      status="open"
      lostReasonOptions={[]}
      scheduleFollowUpAfterWon={false}
    />,
  );
  const lostBtn = screen.getByRole("button", { name: "Lost" });
  expect(lostBtn).toBeEnabled();
  fireEvent.click(lostBtn);
  // Pipedrive parity: the flow is a centered modal, not an inline row.
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent("Mark as Lost");
  fireEvent.change(screen.getByLabelText("Comments (optional)"), {
    target: { value: "Went with a competitor" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Mark as lost" }));
  await waitFor(() => expect(markLostAction).toHaveBeenCalledTimes(1));
  expect(markLostAction.mock.calls[0]?.[0]).toMatchObject({
    dealId: "d1",
    lostReasonId: null,
    lostReason: "Went with a competitor",
  });
});

it("sends the preset reason and the comment together (they coexist, Pipedrive parity)", async () => {
  render(
    <DealCloseActions
      dealId="d1"
      status="open"
      lostReasonOptions={[{ id: "r1", name: "Too expensive" }]}
      scheduleFollowUpAfterWon={false}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Lost" }));
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByLabelText("Lost reason"));
  fireEvent.click(screen.getByText("Too expensive"));
  fireEvent.change(screen.getByLabelText("Comments (optional)"), {
    target: { value: "Budget cut mid-quarter" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Mark as lost" }));
  await waitFor(() => expect(markLostAction).toHaveBeenCalledTimes(1));
  expect(markLostAction.mock.calls[0]?.[0]).toEqual({
    dealId: "d1",
    lostReasonId: "r1",
    lostReason: "Budget cut mid-quarter",
  });
});

it("submits a no-reason Lost when both the preset and comment are left empty", async () => {
  render(
    <DealCloseActions
      dealId="d1"
      status="open"
      lostReasonOptions={[{ id: "r1", name: "Too expensive" }]}
      scheduleFollowUpAfterWon={false}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Lost" }));
  fireEvent.click(await screen.findByRole("button", { name: "Mark as lost" }));
  await waitFor(() => expect(markLostAction).toHaveBeenCalledTimes(1));
  expect(markLostAction.mock.calls[0]?.[0]).toEqual({
    dealId: "d1",
    lostReasonId: null,
    lostReason: null,
  });
});

it("shows the lost reason and comment on a closed lost deal (read-back, not silently dropped)", () => {
  render(
    <DealCloseActions
      {...props}
      status="lost"
      lostReasonName="Too expensive"
      lostReasonText="Budget cut mid-quarter"
    />,
  );
  expect(screen.getByText(/Too expensive/)).toBeInTheDocument();
  expect(screen.getByText(/Budget cut mid-quarter/)).toBeInTheDocument();
});

it("with the pref enabled, Won opens a follow-up activity prompt prefilled for the deal instead of refreshing", async () => {
  render(<DealCloseActions {...props} scheduleFollowUpAfterWon={true} />);
  fireEvent.click(screen.getByRole("button", { name: "Won" }));
  await waitFor(() => expect(markWonAction).toHaveBeenCalledTimes(1));

  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  expect(screen.getByText("Add activity")).toBeInTheDocument();
  expect(routerRefresh).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(routerRefresh).toHaveBeenCalledTimes(1);
});

it("with the pref disabled, Won just refreshes and shows no follow-up prompt", async () => {
  render(<DealCloseActions {...props} scheduleFollowUpAfterWon={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Won" }));
  await waitFor(() => expect(markWonAction).toHaveBeenCalledTimes(1));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(routerRefresh).toHaveBeenCalledTimes(1);
});

it("shows a Reopen control on a won deal (recovery from a mis-clicked close)", () => {
  render(<DealCloseActions {...props} status="won" />);
  expect(screen.getByText("won")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reopen" })).toBeInTheDocument();
});

it("clicking Reopen calls reopenDealAction and refreshes", async () => {
  render(<DealCloseActions {...props} status="lost" />);
  fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
  await waitFor(() => expect(reopenDealAction).toHaveBeenCalledTimes(1));
  expect(reopenDealAction).toHaveBeenCalledWith({ dealId: "d1" }, "csrf");
  await waitFor(() => expect(routerRefresh).toHaveBeenCalledTimes(1));
});

it("surfaces the error when Won is denied and does not refresh (no silent swallow)", async () => {
  markWonAction.mockResolvedValueOnce({ ok: false as const, error: { id: "E_PERM_001" } } as never);
  render(<DealCloseActions {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Won" }));
  await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
  expect(routerRefresh).not.toHaveBeenCalled();
});

it("surfaces the error when Lost is denied (no silent swallow)", async () => {
  markLostAction.mockResolvedValueOnce({
    ok: false as const,
    error: { id: "E_PERM_001" },
  } as never);
  render(<DealCloseActions {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Lost" }));
  fireEvent.click(await screen.findByRole("button", { name: "Mark as lost" }));
  await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
});

it("surfaces the error when Reopen is denied (no silent swallow)", async () => {
  reopenDealAction.mockResolvedValueOnce({
    ok: false as const,
    error: { id: "E_PERM_001" },
  } as never);
  render(<DealCloseActions {...props} status="won" />);
  fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
  await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
});

it("plays the win chime on a successful Won when the winSound preference is on", async () => {
  render(withWinSound(<DealCloseActions {...props} />, true));
  fireEvent.click(screen.getByRole("button", { name: "Won" }));
  await waitFor(() => expect(markWonAction).toHaveBeenCalledTimes(1));
  expect(playWinChime).toHaveBeenCalledTimes(1);
});

it("does not play the win chime when the winSound preference is off", async () => {
  render(withWinSound(<DealCloseActions {...props} />, false));
  fireEvent.click(screen.getByRole("button", { name: "Won" }));
  await waitFor(() => expect(markWonAction).toHaveBeenCalledTimes(1));
  expect(playWinChime).not.toHaveBeenCalled();
});

it("does not play the win chime when Won is denied", async () => {
  markWonAction.mockResolvedValueOnce({ ok: false as const, error: { id: "E_PERM_001" } } as never);
  render(withWinSound(<DealCloseActions {...props} />, true));
  fireEvent.click(screen.getByRole("button", { name: "Won" }));
  await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
  expect(playWinChime).not.toHaveBeenCalled();
});
