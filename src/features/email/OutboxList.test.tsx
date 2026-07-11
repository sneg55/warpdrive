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
});

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
                // Scheduled for the future BUT already claimed by a worker (status "sending"):
                // the server refuses cancel, so the button must not appear despite scheduledAt.
                id: "a3",
                subject: "Claimed",
                to: ["c@y.com"],
                status: "sending",
                scheduledAt: "2099-01-01T00:00:00.000Z",
                errorId: null,
                createdAt: "",
              },
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
  expect(cancels).toHaveLength(1); // only the pending row
});

it("reports the error id when cancel is denied (no silent no-op)", async () => {
  cancelMock.mockResolvedValueOnce({ ok: false, error: { id: "E_PERM_001" } } as never);
  render(<OutboxList />);
  screen.getByRole("button", { name: /Cancel/ }).click();
  await waitFor(() => expect(reportError).toHaveBeenCalledWith("E_PERM_001"));
});
