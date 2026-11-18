// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const reportError = vi.fn();
vi.mock("@/components/shell/ActionErrorProvider", () => ({
  useActionError: () => reportError,
}));

afterEach(() => {
  cleanup();
  reportError.mockClear();
  extraRows.length = 0;
});

const extraRows: Record<string, unknown>[] = [];
const cancelMock = vi.fn(() => Promise.resolve({ ok: true, value: { id: "a1" } }));
vi.mock("./folderActions", () => ({
  cancelOutboxAction: (...args: unknown[]) => cancelMock(...(args as [])),
}));
vi.mock("@/lib/trpc-client", () => ({
  trpc: {
    email: {
      folders: {
        outbox: {
          useQuery: () => ({
            data: [
              {
                id: "a1",
                subject: "Queued",
                to: ["a@y.com"],
                status: "pending",
                scheduledAt: null,
                errorId: null,
                createdAt: "",
              },
              {
                id: "a2",
                subject: "Stuck",
                to: ["b@y.com"],
                status: "needs_review",
                scheduledAt: null,
                errorId: "E_GMAIL_004",
                createdAt: "",
              },
              {
                id: "a3",
                subject: "Claimed",
                to: ["c@y.com"],
                status: "sending",
                scheduledAt: "2099-01-01T00:00:00.000Z",
                errorId: null,
                createdAt: "",
              },
              ...extraRows,
            ],
          }),
        },
      },
    },
    useUtils: () => ({ email: { folders: { outbox: { invalidate: vi.fn() } } } }),
  },
}));
vi.mock("@/utils/csrfCookie", () => ({ readCsrfToken: () => "csrf" }));

import { OutboxList } from "./OutboxList";

it("renders queued and needs_review rows; Cancel only on pending", () => {
  render(<OutboxList />);
  expect(screen.getByText("Queued")).toBeInTheDocument();
  expect(screen.getByText("Stuck")).toBeInTheDocument();
  expect(screen.getByText(/E_GMAIL_004/)).toBeInTheDocument();
  const cancels = screen.getAllByRole("button", { name: /Cancel/ });
  expect(cancels).toHaveLength(1);
});

it("reports the error id when cancel is denied (no silent no-op)", async () => {
  cancelMock.mockResolvedValueOnce({ ok: false, error: { id: "E_PERM_001" } } as never);
  render(<OutboxList />);
  screen.getByRole("button", { name: /Cancel/ }).click();
  await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
});

it('OutboxList shows "Waiting for sending limit, sends at"', () => {
  const nextAttemptAt = "2026-11-17T15:30:00.000Z";
  extraRows.push({
    id: "a4",
    subject: "Over the limit",
    to: ["d@y.com"],
    status: "waiting_for_limit",
    scheduledAt: null,
    nextAttemptAt,
    errorId: "E_AINBOX_004",
    createdAt: "",
  });
  render(<OutboxList />);
  expect(
    screen.getByText(
      `Waiting for sending limit, sends at ${new Date(nextAttemptAt).toLocaleString()}`,
    ),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /Cancel/ })).toHaveLength(2);
  expect(screen.queryByText("E_AINBOX_004")).not.toBeInTheDocument();
});

it("a waiting row that was scheduled reads as waiting, not scheduled", () => {
  extraRows.push({
    id: "a5",
    subject: "Scheduled then limited",
    to: ["e@y.com"],
    status: "waiting_for_limit",
    scheduledAt: "2026-11-17T09:00:00.000Z",
    nextAttemptAt: "2026-11-17T15:30:00.000Z",
    errorId: "E_AINBOX_004",
    createdAt: "",
  });
  render(<OutboxList />);
  expect(screen.getByText(/^Waiting for sending limit, sends at /)).toBeInTheDocument();
  expect(
    screen.queryByText(`Scheduled ${new Date("2026-11-17T09:00:00.000Z").toLocaleString()}`),
  ).not.toBeInTheDocument();
});

it("a sending row with a scheduled re-send hides its error id", () => {
  extraRows.push({
    id: "a6",
    subject: "Re-send scheduled",
    to: ["f@y.com"],
    status: "sending",
    scheduledAt: null,
    nextAttemptAt: null,
    errorId: "E_AINBOX_010",
    createdAt: "",
  });
  render(<OutboxList />);
  expect(screen.getByText("Re-send scheduled")).toBeInTheDocument();
  expect(screen.queryByText("E_AINBOX_010")).not.toBeInTheDocument();
});
